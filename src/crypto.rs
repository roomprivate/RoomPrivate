use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use serde_json::json;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Encryption failed")]
    EncryptionError,
    #[error("Decryption failed")]
    DecryptionError,
    #[error("Invalid key format")]
    InvalidKeyError,
}

pub struct RoomCrypto {
    cipher: Aes256Gcm,
}
impl RoomCrypto {
    pub fn new() -> (Self, String) {
        let mut key_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut key_bytes);
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let key_base64 = BASE64.encode(key_bytes);
        
        (Self { cipher }, key_base64)
    }

    pub fn from_key(key_base64: &str) -> Result<Self, CryptoError> {
        let key_bytes = BASE64.decode(key_base64)
            .map_err(|_| CryptoError::InvalidKeyError)?;
        
        if key_bytes.len() != 32 {
            return Err(CryptoError::InvalidKeyError);
        }
        
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        Ok(Self { cipher })
    }

    pub fn encrypt(&self, message: &str) -> Result<String, CryptoError> {
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self.cipher
            .encrypt(nonce, message.as_bytes())
            .map_err(|_| CryptoError::EncryptionError)?;

        let mut combined = nonce_bytes.to_vec();
        combined.extend(ciphertext);
        Ok(BASE64.encode(combined))
    }

    pub fn decrypt(&self, encrypted_base64: &str) -> Result<String, CryptoError> {
        let encrypted = BASE64.decode(encrypted_base64)
            .map_err(|_| CryptoError::DecryptionError)?;
        
        if encrypted.len() < 12 {
            return Err(CryptoError::DecryptionError);
        }

        let (nonce_bytes, ciphertext) = encrypted.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = self.cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| CryptoError::DecryptionError)?;

        String::from_utf8(plaintext)
            .map_err(|_| CryptoError::DecryptionError)
    }
    pub fn generate_join_key(room_id: &str, password: Option<&str>) -> String {
        let mut hasher = Sha256::new();
        hasher.update(room_id.as_bytes());
        
        if let Some(pass) = password {
            hasher.update(b":");
            hasher.update(pass.as_bytes());
        }
        
        BASE64.encode(hasher.finalize())
    }
}
