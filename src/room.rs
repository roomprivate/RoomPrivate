use std::collections::HashMap;
use tokio::sync::RwLock;
use uuid::Uuid;
use std::sync::Arc;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct RoomInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub has_password: bool,
    pub join_key: String,
}

#[derive(Clone)]
pub struct Room {
    pub info: RoomInfo,
    password: Option<String>,
    encryption_key: String,
    participants: Arc<RwLock<HashMap<String, String>>>, // participant_id -> name
}

impl Room {
    pub fn new(
        name: String,
        description: String,
        password: Option<String>,
        encryption_key: String,
    ) -> Self {
        let id = Uuid::new_v4().to_string();
        let join_key = super::crypto::RoomCrypto::generate_join_key(&id, password.as_deref());
        
        Room {
            info: RoomInfo {
                id,
                name,
                description,
                has_password: password.is_some(),
                join_key,
            },
            password,
            encryption_key,
            participants: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn add_participant(&self, participant_id: String, name: String) {
        let mut participants = self.participants.write().await;
        participants.insert(participant_id, name);
    }

    pub async fn remove_participant(&self, participant_id: &str) {
        let mut participants = self.participants.write().await;
        participants.remove(participant_id);
    }

    pub async fn get_participants(&self) -> Vec<(String, String)> {
        let participants = self.participants.read().await;
        participants
            .iter()
            .map(|(id, name)| (id.clone(), name.clone()))
            .collect()
    }

    pub fn verify_password(&self, password: Option<&str>) -> bool {
        match (&self.password, password) {
            (None, None) => true,
            (Some(room_pass), Some(provided_pass)) => room_pass == provided_pass,
            _ => false,
        }
    }

    pub fn get_encryption_key(&self) -> &str {
        &self.encryption_key
    }
}
