use std::collections::HashMap;
use std::sync::Arc;
use std::error::Error as StdError;
use tokio::sync::Mutex;
use futures::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::{WebSocketStream, tungstenite::Message};
use serde_json::{Value, json};
use uuid::Uuid;
use crate::models::{User, Room, Message as ChatMessage};

type BoxError = Box<dyn StdError + Send + Sync + 'static>;

pub struct SocketHandler {
    users: Arc<Mutex<HashMap<String, User>>>,
    rooms: Arc<Mutex<HashMap<String, Room>>>,
    connections: Arc<Mutex<HashMap<String, WebSocketStream<TcpStream>>>>,
}

impl SocketHandler {
    pub fn new() -> Self {
        SocketHandler {
            users: Arc::new(Mutex::new(HashMap::new())),
            rooms: Arc::new(Mutex::new(HashMap::new())),
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn clone(&self) -> Self {
        SocketHandler {
            users: Arc::clone(&self.users),
            rooms: Arc::clone(&self.rooms),
            connections: Arc::clone(&self.connections),
        }
    }

    pub async fn store_connection(&self, socket_id: &str, ws_stream: WebSocketStream<TcpStream>) {
        let mut connections = self.connections.lock().await;
        connections.insert(socket_id.to_string(), ws_stream);
    }

    pub async fn send_to_socket(&self, socket_id: &str, event: &str, data: Value) -> Result<(), BoxError> {
        let mut connections = self.connections.lock().await;
        if let Some(conn) = connections.get_mut(socket_id) {
            let message = json!({
                "event": event,
                "data": data,
                "socketId": socket_id
            });
            
            conn.send(Message::Text(message.to_string())).await?;
        }

        Ok(())
    }

    pub async fn receive_message(&self, socket_id: &str) -> Result<Option<Message>, BoxError> {
        let mut connections = self.connections.lock().await;
        if let Some(conn) = connections.get_mut(socket_id) {
            if let Some(msg) = conn.next().await {
                return Ok(Some(msg?));
            }
        }
        Ok(None)
    }

    pub async fn handle_message(&self, socket_id: &str, msg: Value) -> Result<(), BoxError> {
        let event = msg["event"].as_str().unwrap_or_default();
        let data = msg["data"].clone();

        match event {
            "register-public-key" => self.handle_register_public_key(socket_id, data).await?,
            "create-room" => self.handle_create_room(socket_id, data).await?,
            "join-room" => self.handle_join_room(socket_id, data).await?,
            "leave-room" => self.handle_leave_room(socket_id, data).await?,
            "message" => self.handle_room_message(socket_id, data).await?,
            "disconnect" => self.handle_disconnect(socket_id).await?,
            _ => println!("Unknown event: {}", event),
        }

        Ok(())
    }

    async fn handle_register_public_key(&self, socket_id: &str, data: Value) -> Result<(), BoxError> {
        let public_key = data["publicKey"].as_str().unwrap_or_default();
        let username = data["username"].as_str().unwrap_or_default();

        let mut users = self.users.lock().await;
        users.insert(socket_id.to_string(), User {
            socket_id: socket_id.to_string(),
            username: username.to_string(),
            public_key: public_key.to_string(),
            status: Some("online".to_string()),
        });

        // Send confirmation back to the client
        self.send_to_socket(socket_id, "public-key-registered", json!({
            "success": true,
            "socketId": socket_id
        })).await?;

        Ok(())
    }

    async fn handle_create_room(&self, socket_id: &str, data: Value) -> Result<(), BoxError> {
        let room_name = data["roomName"].as_str().unwrap_or_default();
        let username = data["username"].as_str().unwrap_or_default();
        let description = data["description"].as_str().unwrap_or_default();
        let max_members = data["maxMembers"].as_u64().unwrap_or(0);
        let password = data["password"].as_str().unwrap_or_default();
        let room_id = Uuid::new_v4().to_string();

        // Update or create user
        let mut users = self.users.lock().await;
        users.insert(socket_id.to_string(), User {
            socket_id: socket_id.to_string(),
            username: username.to_string(),
            public_key: data["publicKey"].as_str().unwrap_or_default().to_string(),
            status: Some("online".to_string()),
        });

        // Create room
        let mut rooms = self.rooms.lock().await;
        rooms.insert(room_id.clone(), Room {
            id: room_id.clone(),
            name: room_name.to_string(),
            users: vec![socket_id.to_string()],
            description: Some(description.to_string()),
            max_members: Some(max_members as usize),
            password: if password.is_empty() { None } else { Some(password.to_string()) },
        });

        // Send room creation confirmation
        self.send_to_socket(socket_id, "room-created", json!({
            "roomId": room_id,
            "name": room_name,
            "description": description,
            "maxMembers": max_members,
            "userId": socket_id,
            "members": [{
                "userId": socket_id,
                "username": username,
                "status": "online"
            }]
        })).await?;

        Ok(())
    }

    async fn handle_join_room(&self, socket_id: &str, data: Value) -> Result<(), BoxError> {
        let room_id = data["roomId"].as_str().unwrap_or_default();
        
        let mut rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get_mut(room_id) {
            if !room.users.contains(&socket_id.to_string()) {
                room.users.push(socket_id.to_string());

                // Notify all users in the room
                let users = self.users.lock().await;
                let user = users.get(socket_id).unwrap();
                
                for user_id in &room.users {
                    self.send_to_socket(user_id, "user-joined", json!({
                        "roomId": room_id,
                        "user": {
                            "socketId": socket_id,
                            "username": user.username
                        }
                    })).await?;
                }
            }
        }

        Ok(())
    }

    async fn handle_leave_room(&self, socket_id: &str, data: Value) -> Result<(), BoxError> {
        let room_id = data["roomId"].as_str().unwrap_or_default();
        
        let mut rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get_mut(room_id) {
            if let Some(pos) = room.users.iter().position(|x| x == socket_id) {
                room.users.remove(pos);

                // Notify remaining users
                let users = self.users.lock().await;
                let user = users.get(socket_id).unwrap();
                
                for user_id in &room.users {
                    self.send_to_socket(user_id, "user-left", json!({
                        "roomId": room_id,
                        "user": {
                            "socketId": socket_id,
                            "username": user.username
                        }
                    })).await?;
                }
            }
        }

        Ok(())
    }

    async fn handle_room_message(&self, socket_id: &str, data: Value) -> Result<(), BoxError> {
        let room_id = data["roomId"].as_str().unwrap_or_default();
        let content = data["content"].as_str().unwrap_or_default();
        
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            let users = self.users.lock().await;
            let sender = users.get(socket_id).unwrap();

            // Extract mentions
            let mentions: Vec<String> = self.extract_mentions(content, &room.users).await;
            
            // Create message object
            let message = ChatMessage {
                id: Uuid::new_v4().to_string(),
                content: content.to_string(),
                sender_id: socket_id.to_string(),
                sender_name: sender.username.clone(),
                room_id: room_id.to_string(),
                mentions,
                timestamp: chrono::Utc::now().timestamp(),
            };

            // Send to all users in the room
            for user_id in &room.users {
                if let Some(recipient) = users.get(user_id) {
                    let encrypted_message = self.encrypt_for_user(&message, &recipient.public_key)?;
                    
                    self.send_to_socket(user_id, "message", json!({
                        "roomId": room_id,
                        "message": encrypted_message,
                        "sender": {
                            "socketId": socket_id,
                            "username": sender.username
                        }
                    })).await?;
                }
            }
        }

        Ok(())
    }

    async fn handle_disconnect(&self, socket_id: &str) -> Result<(), BoxError> {
        // Remove user from all rooms
        let mut rooms = self.rooms.lock().await;
        for room in rooms.values_mut() {
            if let Some(pos) = room.users.iter().position(|x| x == socket_id) {
                room.users.remove(pos);
            }
        }

        // Remove user
        let mut users = self.users.lock().await;
        users.remove(socket_id);

        // Remove connection
        let mut connections = self.connections.lock().await;
        connections.remove(socket_id);

        Ok(())
    }

    async fn extract_mentions(&self, content: &str, room_users: &[String]) -> Vec<String> {
        let users = self.users.lock().await;
        let mut mentions = Vec::new();
        
        for word in content.split_whitespace() {
            if word.starts_with('@') {
                let username = &word[1..];
                if let Some(user) = users.values().find(|u| u.username == username) {
                    if room_users.contains(&user.socket_id) {
                        mentions.push(user.socket_id.clone());
                    }
                }
            }
        }
        
        mentions
    }

    fn encrypt_for_user(&self, message: &ChatMessage, _public_key: &str) -> Result<String, BoxError> {
        use aes_gcm::{
            aead::{Aead, KeyInit, OsRng},
            Aes256Gcm,
            Nonce,
        };
        use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

        // Generate a random key for AES encryption
        let key = Aes256Gcm::generate_key(&mut OsRng);
        let cipher = Aes256Gcm::new(&key);
        let nonce = Nonce::from_slice(b"unique nonce"); // In production, use a random nonce

        // Encrypt the message
        let message_json = serde_json::to_string(message)?;
        let encrypted_message = cipher.encrypt(nonce, message_json.as_bytes())
            .map_err(|e| format!("Encryption error: {}", e))?;
        let encrypted_message_base64 = BASE64.encode(encrypted_message);

        // Encrypt the key with the public key (in production, use proper asymmetric encryption)
        let encrypted_key = BASE64.encode(&key);

        Ok(json!({
            "key": encrypted_key,
            "message": encrypted_message_base64
        }).to_string())
    }
}
