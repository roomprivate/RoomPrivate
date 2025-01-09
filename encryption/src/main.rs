use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::{rngs::OsRng, RngCore};
use rsa::{Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::{
    error::Error,
    fmt,
    io::{self, BufRead, BufReader, Write},
};
use uuid::Uuid;

const RSA_BITS: usize = 2048;

#[derive(Debug)]
struct EncryptionError(String);

impl fmt::Display for EncryptionError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Encryption error: {}", self.0)
    }
}

impl Error for EncryptionError {}

#[derive(Serialize, Deserialize)]
struct EncryptRequest {
    value: String,
    aes_key: String,
    aes_iv: String,
}

#[derive(Serialize, Deserialize)]
struct EncryptResponse {
    encrypted: String,
    public_key: String,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
enum Request {
    #[serde(rename = "encrypt")]
    Encrypt(EncryptRequest),
    #[serde(rename = "generate_uuid")]
    GenerateUuid,
    #[serde(rename = "hash_password")]
    HashPassword { password: String },
    #[serde(rename = "generate_room_key")]
    GenerateRoomKey,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
enum Response {
    #[serde(rename = "encrypt")]
    Encrypt {
        encrypted: String,
        public_key: String,
    },
    #[serde(rename = "uuid")]
    Uuid {
        uuid: String,
    },
    #[serde(rename = "hashed_password")]
    HashedPassword {
        hash: String,
    },
    #[serde(rename = "room_key")]
    RoomKey {
        key: String,
    },
    #[serde(rename = "error")]
    Error {
        error: String,
    },
}

struct EncryptionService {
    rsa_private_key: RsaPrivateKey,
    rsa_public_key: RsaPublicKey,
}

impl EncryptionService {
    fn new() -> Self {
        let mut rng = OsRng;
        let private_key = RsaPrivateKey::new(&mut rng, RSA_BITS).expect("Failed to generate RSA key");
        let public_key = RsaPublicKey::from(&private_key);
        
        Self {
            rsa_private_key: private_key,
            rsa_public_key: public_key,
        }
    }

    fn encrypt_aes(&self, data: &[u8], key: &[u8], iv: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| EncryptionError(format!("Failed to create cipher: {}", e)))?;
        let nonce = Nonce::from_slice(iv);
        let encrypted = cipher
            .encrypt(nonce, data)
            .map_err(|e| EncryptionError(format!("Failed to encrypt: {}", e)))?;
        Ok(encrypted)
    }

    fn encrypt_rsa(&self, data: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
        let mut rng = OsRng;
        let encrypted = self
            .rsa_public_key
            .encrypt(&mut rng, Pkcs1v15Encrypt, data)
            .map_err(|e| EncryptionError(format!("Failed to encrypt with RSA: {}", e)))?;
        Ok(encrypted)
    }

    fn process_encrypt_request(&self, request: EncryptRequest) -> Result<Response, Box<dyn Error>> {
        let aes_key = BASE64
            .decode(&request.aes_key)
            .map_err(|e| EncryptionError(format!("Failed to decode AES key: {}", e)))?;
        let aes_iv = BASE64
            .decode(&request.aes_iv)
            .map_err(|e| EncryptionError(format!("Failed to decode AES IV: {}", e)))?;
        
        let encrypted_data = self.encrypt_aes(request.value.as_bytes(), &aes_key, &aes_iv)?;
        let encrypted_key = self.encrypt_rsa(&aes_key)?;
        
        Ok(Response::Encrypt {
            encrypted: BASE64.encode(&encrypted_data),
            public_key: BASE64.encode(&encrypted_key),
        })
    }

    fn generate_uuid(&self) -> Response {
        Response::Uuid {
            uuid: Uuid::new_v4().to_string(),
        }
    }

    fn hash_password(&self, password: String) -> Response {
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        let hash = hasher.finalize();
        
        Response::HashedPassword {
            hash: format!("{:x}", hash),
        }
    }

    fn generate_room_key(&self) -> Response {
        let mut key = vec![0u8; 32];
        OsRng.fill_bytes(&mut key);
        
        Response::RoomKey {
            key: BASE64.encode(&key),
        }
    }

    fn process_request(&self, request: Request) -> Result<Response, Box<dyn Error>> {
        match request {
            Request::Encrypt(req) => self.process_encrypt_request(req),
            Request::GenerateUuid => Ok(self.generate_uuid()),
            Request::HashPassword { password } => Ok(self.hash_password(password)),
            Request::GenerateRoomKey => Ok(self.generate_room_key()),
        }
    }

    fn send_response(&self, response: Result<Response, Box<dyn Error>>) -> Result<(), Box<dyn Error>> {
        let stdout = io::stdout();
        let mut handle = stdout.lock();
        
        let response = match response {
            Ok(response) => response,
            Err(e) => Response::Error {
                error: e.to_string(),
            },
        };

        serde_json::to_writer(&mut handle, &response)?;
        writeln!(&mut handle)?;
        handle.flush()?;
        Ok(())
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    let stdin = io::stdin();
    let reader = BufReader::new(stdin.lock());
    let service = EncryptionService::new();

    for line in reader.lines() {
        match line {
            Ok(input) if input.is_empty() => continue,
            Ok(input) => {
                let request = match serde_json::from_str(&input) {
                    Ok(req) => req,
                    Err(e) => {
                        service.send_response(Err(Box::new(EncryptionError(format!(
                            "Invalid request: {}", e
                        )))))?;
                        continue;
                    }
                };

                let result = service.process_request(request);
                service.send_response(result)?;
            }
            Err(e) => {
                eprintln!("Failed to read input: {}", e);
                return Err(Box::new(e));
            }
        }
    }
    Ok(())
}
