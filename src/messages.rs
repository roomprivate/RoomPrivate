use serde::{Deserialize, Serialize};
use super::files::FileMetadata;

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ClientMessage {
    RetrieveMessages,
    #[serde(rename = "create_room")]
    CreateRoom {
        name: String,
        description: String,
        password: Option<String>,
        user_name: String,
    },
    #[serde(rename = "join_room")]
    JoinRoom {
        join_key: String,
        password: Option<String>,
        name: String,
    },
    #[serde(rename = "leave_room")]
    LeaveRoom,
    #[serde(rename = "chat_message")]
    ChatMessage {
        content: String,
    },
    #[serde(rename = "get_members")]
    GetMembers,
    #[serde(rename = "upload_file")]
    UploadFile {
        name: String,
        mime_type: String,
        content: String,
    },
    #[serde(rename = "get_file")]
    GetFile {
        file_id: String,
    },
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ServerMessage {
    MessagesRetrieved { messages: Vec<ServerMessage> },
    #[serde(rename = "room_created")]
    RoomCreated {
        room_info: super::room::RoomInfo,
        encryption_key: String,
    },
    #[serde(rename = "room_joined")]
    RoomJoined {
        room_info: super::room::RoomInfo,
        encryption_key: String,
        participants: Vec<String>,
    },
    #[serde(rename = "participant_joined")]
    ParticipantJoined {
        name: String,
    },
    #[serde(rename = "participant_left")]
    ParticipantLeft {
        name: String,
    },
    #[serde(rename = "chat_message")]
    ChatMessage {
        sender: String,
        content: String,
        is: bool,
    },
    #[serde(rename = "member_list")]
    MemberList {
        members: Vec<String>,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
    },
    #[serde(rename = "file_uploaded")]
    FileUploaded {
        metadata: super::files::FileMetadata,
    },
    #[serde(rename = "file_content")]
    FileContent {
        metadata: FileMetadata,
        content: String,
    },
}
