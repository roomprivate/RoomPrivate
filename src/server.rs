use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use rand::{distributions::Alphanumeric, Rng};
use tokio::sync::RwLock;
use tokio::sync::mpsc;
use futures_util::{SinkExt, StreamExt};
use warp::ws::{Message, WebSocket};
use uuid::Uuid;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

use crate::room::Room;
use crate::messages::{ClientMessage, ServerMessage};
use crate::crypto::RoomCrypto;
use crate::files::FileManager;

type Rooms = Arc<RwLock<HashMap<String, Room>>>;
type Connections = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>;

#[derive(Clone)]
pub struct Server {
    rooms: Rooms,
    connections: Connections,
    pub file_manager: Arc<FileManager>,
}

impl Server {
    pub async fn new() -> Self {
        let server = Server {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            connections: Arc::new(RwLock::new(HashMap::new())),
            file_manager: Arc::new(FileManager::new().await.expect("Failed to create file manager")),
        };
        let connections = Arc::clone(&server.connections);

        let connections_layer1 = Arc::clone(&connections);
        let server_clone_layer1 = Arc::new(server.clone());
        tokio::spawn(async move {
            loop {
                let fake_message = server_clone_layer1.generate_fake_message();
                server_clone_layer1.send_fake_message(&connections_layer1, fake_message).await;
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });

        let connections_layer2 = Arc::clone(&connections);
        let server_clone_layer2 = Arc::new(server.clone());
        tokio::spawn(async move {
            loop {
                let fake_message = server_clone_layer2.generate_fake_message();
                server_clone_layer2.send_fake_message(&connections_layer2, fake_message).await;
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });

        let connections_layer3 = Arc::clone(&connections);
        let server_clone_layer3 = Arc::new(server.clone());
        tokio::spawn(async move {
            loop {
                let fake_message = server_clone_layer3.generate_fake_message();
                server_clone_layer3.send_fake_message(&connections_layer3, fake_message).await;
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        });

        server
    }

    fn generate_fake_message(&self) -> ServerMessage {
        let sender: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(7)
            .map(char::from)
            .collect();

        let content: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(20)
            .map(char::from)
            .collect();

        ServerMessage::ChatMessage {
            sender,
            content,
            is: true, //temporary fix
        }
    }

    async fn send_fake_message(&self, connections: &Connections, message: ServerMessage) {
        let connections_lock = connections.read().await;
        for sender in connections_lock.values() {
            if let Ok(msg) = serde_json::to_string(&message) {
                let _ = sender.send(Message::text(msg));
        }
    }
    }

    pub async fn get_file(&self, file_id: &str) -> Option<(crate::files::FileMetadata, Vec<u8>)> {
        self.file_manager.get_file(file_id).await
    }

    pub async fn handle_connection(&self, ws: WebSocket) {
        let participant_id = Uuid::new_v4().to_string();
        let (mut ws_tx, mut ws_rx) = ws.split();
        let (tx, mut rx) = mpsc::unbounded_channel();

        {
            let mut connections = self.connections.write().await;
            connections.insert(participant_id.clone(), tx);
        }

        let rooms = self.rooms.clone();
        let connections = self.connections.clone();
        let participant_id_clone = participant_id.clone();
        let file_manager = self.file_manager.clone();

        tokio::spawn(async move {
            while let Some(result) = ws_rx.next().await {
                match result {
                    Ok(msg) => {
                        if let Ok(text) = msg.to_str() {
                            if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(text) {
                                Self::handle_client_message(
                                    client_msg,
                                    &participant_id_clone,
                                    &rooms,
                                    &connections,
                                    &file_manager,
                                ).await;
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("WebSocket error: {}", e);
                        break;
                    }
                }
            }

            Self::handle_disconnect(&participant_id_clone, &rooms, &connections).await;
        });

        tokio::spawn(async move {
            while let Some(message) = rx.recv().await {
                if let Err(e) = ws_tx.send(message).await {
                    eprintln!("Failed to send WebSocket message: {}", e);
                    break;
                }
            }
        });
    }

    async fn handle_client_message(
        message: ClientMessage,
        participant_id: &str,
        rooms: &Rooms,
        connections: &Connections,
        file_manager: &FileManager,
    ) {
        match message {
            ClientMessage::CreateRoom { name, description, password, user_name } => {
                let (_, encryption_key) = RoomCrypto::new();
                let room = Room::new(name.clone(), description, password, encryption_key.clone());
                let room_info = room.info.clone();
                
                {
                    let mut rooms_lock = rooms.write().await;
                    rooms_lock.insert(room_info.id.clone(), room.clone());
                }

                room.add_participant(participant_id.to_string(), user_name).await;

                Self::send_message_to_participant(
                    participant_id,
                    ServerMessage::RoomCreated {
                        room_info,
                        encryption_key,
                    },
                    connections,
                ).await;

                Self::broadcast_member_list(&room, connections).await;
            },

            ClientMessage::JoinRoom { join_key, password, name } => {
                let mut room_to_join = None;
                
                {
                    let rooms_lock = rooms.read().await;
                    for room in rooms_lock.values() {
                        if room.info.join_key == join_key {
                            if room.verify_password(password.as_deref()) {
                                room_to_join = Some(room.clone());
                                break;
                            }
                        }
                    }
                }

                if let Some(room) = room_to_join {
                    room.add_participant(participant_id.to_string(), name.clone()).await;
                    
                    let participants: Vec<String> = room.get_participants().await
                        .into_iter()
                        .map(|(_, name)| name)
                        .collect();

                    Self::send_message_to_participant(
                        participant_id,
                        ServerMessage::RoomJoined {
                            room_info: room.info.clone(),
                            encryption_key: room.get_encryption_key().to_string(),
                            participants: participants.clone(),
                        },
                        connections,
                    ).await;

                    Self::broadcast_to_room_except(
                        &room,
                        ServerMessage::ParticipantJoined { name },
                        connections,
                        Some(participant_id),
                    ).await;
                    Self::broadcast_member_list(&room, connections).await;
                } else {
                    Self::send_message_to_participant(
                        participant_id,
                        ServerMessage::Error {
                            message: "Invalid room key or password".to_string(),
                        },
                        connections,
                    ).await;
                }
            },

            ClientMessage::ChatMessage { content } => {
                let rooms_lock = rooms.read().await;
                for room in rooms_lock.values() {
                    let participants = room.get_participants().await;
                    if participants.iter().any(|(id, _)| id == participant_id) {
                        let sender_name = participants
                            .iter()
                            .find(|(id, _)| id == participant_id)
                            .map(|(_, name)| name.clone())
                            .unwrap_or_default();

                        Self::broadcast_to_room_except(
                            room,
                            ServerMessage::ChatMessage {
                                sender: sender_name,
                                content,
                                is: false,
                            },
                            connections,
                            Some(participant_id),
                        ).await;
                        break;
                    }
                }
            },

            ClientMessage::GetMembers => {
                let rooms_lock = rooms.read().await;
                for room in rooms_lock.values() {
                    let participants = room.get_participants().await;
                    if participants.iter().any(|(id, _)| id == participant_id) {
                        let member_list: Vec<String> = participants
                            .into_iter()
                            .map(|(_, name)| name)
                            .collect();

                        Self::send_message_to_participant(
                            participant_id,
                            ServerMessage::MemberList {
                                members: member_list,
                            },
                            connections,
                        ).await;
                        break;
                    }
                }
            },

            ClientMessage::LeaveRoom => {
                Self::handle_disconnect(participant_id, rooms, connections).await;
            },

            ClientMessage::UploadFile { name, mime_type, content } => {
                if let Ok(file_data) = BASE64.decode(content) {
                    match file_manager.upload_file(name, mime_type, file_data).await {
                        Ok(metadata) => {
                            let rooms = rooms.read().await;
                            let mut current_room = None;
                            for room in rooms.values() {
                                let participants = room.get_participants().await;
                                if participants.iter().any(|(id, _)| id == participant_id) {
                                    current_room = Some(room);
                                    break;
                                }
                            }
                            

                            if let Some(room) = current_room {
                                let file_message = ServerMessage::ChatMessage {
                                    content: format!("[File: {}](/files/{})", metadata.name, metadata.id),
                                    sender: participant_id.to_string(),
                                    is: false,
                                };
                                

                                Self::broadcast_to_room(room, file_message, connections).await;
                            }

                            let upload_message = ServerMessage::FileUploaded { metadata };
                            Self::send_message_to_participant(participant_id, upload_message, connections).await;
                        }
                        Err(e) => {
                            let message = ServerMessage::Error { message: e };
                            Self::send_message_to_participant(participant_id, message, connections).await;
                        }
                    }
                } else {
                    let message = ServerMessage::Error { 
                        message: "Invalid file data".to_string() 
                    };
                    Self::send_message_to_participant(participant_id, message, connections).await;
                }
            }

            ClientMessage::GetFile { file_id } => {
                if let Some((metadata, content)) = file_manager.get_file(&file_id).await {
                    let content = BASE64.encode(content);
                    let response = ServerMessage::FileContent { metadata, content };
                    Self::send_message_to_participant(participant_id, response, connections).await;
                } else {
                    let error = ServerMessage::Error { 
                        message: "File not found or expired".to_string() 
                    };
                    Self::send_message_to_participant(participant_id, error, connections).await;
                }
            }
        }
    }

    async fn handle_disconnect(
        participant_id: &str,
        rooms: &Rooms,
        connections: &Connections,
    ) {
        let mut rooms_lock = rooms.write().await;
        for room in rooms_lock.values_mut() {
            let participants = room.get_participants().await;
            if let Some((_, name)) = participants.iter().find(|(id, _)| id == participant_id) {
                room.remove_participant(participant_id).await;
                
                Self::broadcast_to_room_except(
                    room,
                    ServerMessage::ParticipantLeft {
                        name: name.clone(),
                    },
                    connections,
                    Some(participant_id),
                ).await;


                Self::broadcast_member_list(room, connections).await;
            }
        }

        let mut connections_lock = connections.write().await;
        connections_lock.remove(participant_id);
    }

    async fn broadcast_to_room(
        room: &Room,
        message: ServerMessage,
        connections: &Connections,
    ) {
        Self::broadcast_to_room_except(room, message, connections, None).await;
    }

    async fn broadcast_to_room_except(
        room: &Room,
        message: ServerMessage,
        connections: &Connections,
        except_participant: Option<&str>,
    ) {
        if let Ok(msg) = serde_json::to_string(&message) {
            let connections_lock = connections.read().await;
            let participants = room.get_participants().await;

            for (participant_id, _) in participants {
                if Some(participant_id.as_str()) != except_participant {
                    if let Some(sender) = connections_lock.get(&participant_id) {
                        let _ = sender.send(Message::text(msg.clone()));
                    }
                }
            }
        }
    }

    async fn broadcast_member_list(
        room: &Room,
        connections: &Connections,
    ) {
        let participants = room.get_participants().await;
        let member_list: Vec<String> = participants
            .into_iter()
            .map(|(_, name)| name)
            .collect();

        Self::broadcast_to_room(
            room,
            ServerMessage::MemberList {
                members: member_list,
            },
            connections,
        ).await;
    }

    async fn send_message_to_participant(
        participant_id: &str,
        message: ServerMessage,
        connections: &Connections,
    ) {
        if let Ok(msg) = serde_json::to_string(&message) {
            let connections_lock = connections.read().await;
            if let Some(sender) = connections_lock.get(participant_id) {
                let _ = sender.send(Message::text(msg));
            }
        }
    }
}
