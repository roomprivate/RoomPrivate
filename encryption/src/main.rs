use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::rngs::OsRng;
use rsa::{Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use std::{
    error::Error,
    fmt,
    io::{self, BufRead, BufReader, Write},
    process::exit,
    sync::Mutex,
};

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

    fn process_request(&self, request: EncryptRequest) -> Result<EncryptResponse, Box<dyn Error>> {
        let aes_key = BASE64
            .decode(&request.aes_key)
            .map_err(|e| EncryptionError(format!("Failed to decode AES key: {}", e)))?;
        let aes_iv = BASE64
            .decode(&request.aes_iv)
            .map_err(|e| EncryptionError(format!("Failed to decode AES IV: {}", e)))?;
        
        // Encrypt the value using AES-GCM
        let encrypted_data = self.encrypt_aes(request.value.as_bytes(), &aes_key, &aes_iv)?;
        
        // Encrypt the AES key using RSA
        let encrypted_key = self.encrypt_rsa(&aes_key)?;
        
        Ok(EncryptResponse {
            encrypted: BASE64.encode(&encrypted_data),
            public_key: BASE64.encode(&encrypted_key),
        })
    }

    fn send_response(&self, response: Result<EncryptResponse, Box<dyn Error>>) -> Result<(), Box<dyn Error>> {
        let stdout = io::stdout();
        let mut handle = stdout.lock();
        
        match response {
            Ok(response) => {
                serde_json::to_writer(&mut handle, &response)?;
                writeln!(&mut handle)?;
            }
            Err(e) => {
                let error_response = serde_json::json!({
                    "error": e.to_string()
                });
                serde_json::to_writer(&mut handle, &error_response)?;
                writeln!(&mut handle)?;
            }
        }
        handle.flush()?;
        Ok(())
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    // Configure stdin for binary input
    let stdin = io::stdin();
    let reader = BufReader::new(stdin.lock());
    let service = EncryptionService::new();

    // Process each line
    for line in reader.lines() {
        match line {
            Ok(input) if input.is_empty() => continue,
            Ok(input) => {
                let request = match serde_json::from_str::<EncryptRequest>(&input) {
                    Ok(req) => req,
                    Err(e) => {
                        if let Err(e) = service.send_response(Err(Box::new(EncryptionError(format!(
                            "Invalid request: {}", e
                        ))))) {
                            eprintln!("Failed to send error response: {}", e);
                            return Err(e);
                        }
                        continue;
                    }
                };

                let result = service.process_request(request);
                if let Err(e) = service.send_response(result) {
                    eprintln!("Failed to send response: {}", e);
                    return Err(e);
                }
            }
            Err(e) => {
                eprintln!("Failed to read input: {}", e);
                return Err(Box::new(e));
            }
        }
    }
    Ok(())
}
