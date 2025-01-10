use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use warp::ws::{Message, WebSocket};
use uuid::Uuid;

use super::room::Room;
use super::messages::{ClientMessage, ServerMessage};
use super::crypto::RoomCrypto;

type Rooms = Arc<RwLock<HashMap<String, Room>>>;
type Connections = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>;

pub struct Server {
    rooms: Rooms,
    connections: Connections,
}

impl Server {
    pub fn new() -> Self {
        Server {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn handle_connection(&self, ws: WebSocket) {
        let participant_id = Uuid::new_v4().to_string();
        let (mut ws_tx, mut ws_rx) = ws.split();
        let (tx, mut rx) = mpsc::unbounded_channel();

        // Store connection
        {
            let mut connections = self.connections.write().await;
            connections.insert(participant_id.clone(), tx);
        }

        // Handle incoming messages
        let rooms = self.rooms.clone();
        let connections = self.connections.clone();
        let participant_id_clone = participant_id.clone();

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
                                ).await;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            // Clean up on disconnect
            Self::handle_disconnect(&participant_id_clone, &rooms, &connections).await;
        });

        // Forward messages to client
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_tx.send(msg).await.is_err() {
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
    ) {
        match message {
            ClientMessage::CreateRoom { name, description, password } => {
                let (_, encryption_key) = RoomCrypto::new();
                let room = Room::new(name.clone(), description, password, encryption_key.clone());
                let room_info = room.info.clone();
                
                {
                    let mut rooms_lock = rooms.write().await;
                    rooms_lock.insert(room_info.id.clone(), room.clone());
                }

                // Add the creator as first member
                room.add_participant(participant_id.to_string(), "Owner".to_string()).await;

                Self::send_message_to_participant(
                    participant_id,
                    ServerMessage::RoomCreated {
                        room_info,
                        encryption_key,
                    },
                    connections,
                ).await;

                // Send initial member list
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
                    
                    // Send room info to the new participant first
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

                    // Then notify all participants about the new member
                    Self::broadcast_to_room_except(
                        &room,
                        ServerMessage::ParticipantJoined { name },
                        connections,
                        Some(participant_id),
                    ).await;

                    // Update member list for all participants
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

                        // The message is already encrypted by the client, just broadcast it
                        Self::broadcast_to_room_except(
                            room,
                            ServerMessage::ChatMessage {
                                sender: sender_name,
                                content,
                            },
                            connections,
                            Some(participant_id), // Don't send back to sender
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
                
                // Notify others that participant left
                Self::broadcast_to_room_except(
                    room,
                    ServerMessage::ParticipantLeft {
                        name: name.clone(),
                    },
                    connections,
                    Some(participant_id),
                ).await;

                // Update member list for remaining participants
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
