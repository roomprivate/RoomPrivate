# WebSocket Server & Client Documentation

## Overview
This document describes the implementation details of the WebSocket-based chat room system, including both server and client specifications.

## Server Architecture

### Core Components
- **Server**: Main struct managing rooms and connections
- **Rooms**: Thread-safe HashMap storing active chat rooms
- **Connections**: Thread-safe HashMap storing WebSocket connections

### Data Structures
```rust
type Rooms = Arc<RwLock<HashMap<String, Room>>>
type Connections = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>
```

## Message Protocol

### Client Messages
Messages that can be sent from client to server:

```rust
enum ClientMessage {
    CreateRoom {
        name: String,
        description: String,
        password: Option<String>
    },
    JoinRoom {
        join_key: String,
        password: Option<String>,
        name: String
    },
    ChatMessage {
        content: String
    },
    GetMembers
}
```

### Server Messages
Messages that can be sent from server to client:

```rust
enum ServerMessage {
    RoomCreated {
        room_info: RoomInfo,
        encryption_key: String
    },
    RoomJoined {
        room_info: RoomInfo,
        encryption_key: String,
        participants: Vec<String>
    },
    ParticipantJoined {
        name: String
    },
    ChatMessage {
        sender: String,
        content: String
    },
    Error {
        message: String
    }
}
```

## Connection Flow

1. **Initial Connection**
   - Client establishes WebSocket connection
   - Server generates unique participant_id (UUID)
   - Server creates bidirectional communication channels

2. **Room Creation**
   - Client sends CreateRoom message
   - Server creates room with encryption key
   - Server responds with RoomCreated message
   - Creator automatically joins as "Owner"

3. **Joining Room**
   - Client sends JoinRoom message with join_key
   - Server validates join_key and password
   - If successful, server sends RoomJoined message
   - All room participants notified via ParticipantJoined

4. **Chat Communication**
   - Messages are end-to-end encrypted
   - Client encrypts message before sending
   - Server broadcasts encrypted message to all room participants
   - Receiving clients decrypt messages using room encryption key

## File Operations

### Upload File
Client sends a file upload request:
```json
{
    "type": "UploadFile",
    "name": "example.jpg",
    "mime_type": "image/jpeg",
    "content": "base64_encoded_file_content"
}
```
Server responds with success:
```json
{
    "type": "FileUploaded",
    "metadata": {
        "id": "unique_file_id",
        "name": "example.jpg",
        "mime_type": "image/jpeg",
        "size": 12345
    }
}
```
Or error:
```json
{
    "type": "Error",
    "message": "Failed to upload file"
}
```
### Download File
Client requests a file:
```json
{
    "type": "GetFile",
    "file_id": "unique_file_id"
}
```
Server responds with file content:
```json
{
    "type": "FileContent",
    "metadata": {
        "id": "unique_file_id",
        "name": "example.jpg",
        "mime_type": "image/jpeg",
        "size": 12345
    },
    "content": "base64_encoded_file_content"
}
```
Or error if file not found:
```json
{
    "type": "Error",
    "message": "File not found or expired"
}
```
### File Message Format
When a file is shared in chat, it appears as a special message:
```json
{
    "type": "ChatMessage",
    "sender": "username",
    "content": "[File: filename](/files/file_id)"
}
```
### Implementation Notes
1. All file content is base64 encoded
2. Files are automatically shared with all room participants
3. Files have a unique ID for retrieval
4. File metadata includes: name, mime type, and size
5. Files may expire after a certain period

## Security Considerations

1. **File Validation**
   - Validate file size before upload
   - Check allowed mime types
   - Scan for malware (recommended)
   - Limit upload frequency

2. **Storage**
   - Implement secure file storage
   - Use proper file permissions
   - Clean up expired files
   - Consider storage quotas

3. **Access Control**
   - Only room participants can access files
   - Validate file ownership
   - Implement rate limiting
   - Use secure file URLs

## Client Implementation Guide

### Required Dependencies
```toml
[dependencies]
tokio = { version = "1.0", features = ["full"] }
tokio-tungstenite = "0.20"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
futures-util = "0.3"
```

### Basic Client Structure
```rust
pub struct ChatClient {
    ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
    encryption_key: Option<String>,
    room_info: Option<RoomInfo>,
    participants: Vec<String>,
}
```

### Connection Steps
1. Establish WebSocket connection:
```rust
let url = "ws://your-server:port";
let (ws_stream, _) = connect_async(url).await?;
```

2. Split stream for sending/receiving:
```rust
let (write, read) = ws_stream.split();
```

3. Handle incoming messages:
```rust
while let Some(msg) = read.next().await {
    let msg = msg?;
    if let Ok(text) = msg.to_str() {
        let server_msg: ServerMessage = serde_json::from_str(text)?;
        // Handle different message types
    }
}
```

### Message Handling
1. **Creating a Room**:
```rust
let create_msg = ClientMessage::CreateRoom {
    name: "Room Name".to_string(),
    description: "Room Description".to_string(),
    password: Some("optional_password".to_string()),
};
let json = serde_json::to_string(&create_msg)?;
ws_stream.send(Message::Text(json)).await?;
```

2. **Joining a Room**:
```rust
let join_msg = ClientMessage::JoinRoom {
    join_key: "room_key".to_string(),
    password: Some("room_password".to_string()),
    name: "User Name".to_string(),
};
let json = serde_json::to_string(&join_msg)?;
ws_stream.send(Message::Text(json)).await?;
```

3. **Sending Messages**:
```rust
let chat_msg = ClientMessage::ChatMessage {
    content: encrypt_message("Hello World!", &encryption_key),
};
let json = serde_json::to_string(&chat_msg)?;
ws_stream.send(Message::Text(json)).await?;
```
