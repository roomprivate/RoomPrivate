use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tokio::fs;
use tokio::sync::RwLock;
use sha2::{Sha256, Digest};
use serde::{Serialize, Deserialize};
use uuid::Uuid;

const MAX_FILE_SIZE: usize = 100 * 1024 * 1024; // 100MB
const FILE_EXPIRY_DURATION: Duration = Duration::from_secs(15 * 60); // 15 minutes

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: usize,
    pub sha256: String,
    pub uploaded_at: SystemTime,
    pub expires_at: SystemTime,
}

#[derive(Debug)]
struct FileEntry {
    metadata: FileMetadata,
    path: PathBuf,
}

pub struct FileManager {
    files: Arc<RwLock<HashMap<String, FileEntry>>>,
    storage_path: PathBuf,
}

impl FileManager {
    pub async fn new() -> std::io::Result<Self> {
        let storage_path = Path::new("temp_files").to_path_buf();
        fs::create_dir_all(&storage_path).await?;
        
        Ok(FileManager {
            files: Arc::new(RwLock::new(HashMap::new())),
            storage_path,
        })
    }

    pub async fn upload_file(
        &self,
        name: String,
        mime_type: String,
        content: Vec<u8>,
    ) -> Result<FileMetadata, String> {
        // Check file size
        if content.len() > MAX_FILE_SIZE {
            return Err("File size exceeds maximum allowed size".to_string());
        }

        // Calculate SHA256
        let mut hasher = Sha256::new();
        hasher.update(&content);
        let sha256 = format!("{:x}", hasher.finalize());

        // Check for duplicates
        {
            let files = self.files.read().await;
            if let Some(existing) = files.values().find(|f| f.metadata.sha256 == sha256) {
                return Ok(existing.metadata.clone());
            }
        }

        let id = Uuid::new_v4().to_string();
        let now = SystemTime::now();
        let expires_at = now + FILE_EXPIRY_DURATION;

        let metadata = FileMetadata {
            id: id.clone(),
            name,
            mime_type,
            size: content.len(),
            sha256,
            uploaded_at: now,
            expires_at,
        };

        let file_path = self.storage_path.join(&id);
        fs::write(&file_path, content).await.map_err(|e| e.to_string())?;

        let entry = FileEntry {
            metadata: metadata.clone(),
            path: file_path,
        };

        // Clone id before moving it into the HashMap
        let mut files = self.files.write().await;
        files.insert(id.clone(), entry);

        // Schedule cleanup
        let files_clone = self.files.clone();
        let id_clone = id.clone();
        let path_clone = self.storage_path.join(&id);
        
        tokio::spawn(async move {
            tokio::time::sleep(FILE_EXPIRY_DURATION).await;
            let mut files = files_clone.write().await;
            if files.remove(&id_clone).is_some() {
                let _ = fs::remove_file(path_clone).await;
            }
        });

        Ok(metadata)
    }

    pub async fn get_file(&self, id: &str) -> Option<(FileMetadata, Vec<u8>)> {
        let files = self.files.read().await;
        let entry = files.get(id)?;
        
        if SystemTime::now() > entry.metadata.expires_at {
            return None;
        }

        match fs::read(&entry.path).await {
            Ok(content) => Some((entry.metadata.clone(), content)),
            Err(_) => None,
        }
    }

    pub async fn cleanup_expired_files(&self) {
        let mut files = self.files.write().await;
        let now = SystemTime::now();
        
        files.retain(|_, entry| {
            let expired = now > entry.metadata.expires_at;
            if expired {
                let _ = std::fs::remove_file(&entry.path);
            }
            !expired
        });
    }
}
