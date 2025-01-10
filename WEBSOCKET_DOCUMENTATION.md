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

## Security Considerations

1. **Encryption**
   - All chat messages are end-to-end encrypted
   - Each room has a unique encryption key
   - Clients must handle encryption/decryption
   - Never send unencrypted messages

2. **Authentication**
   - Room passwords are optional but recommended
   - Join keys are required and unique per room
   - Server validates all join attempts

3. **Connection Security**
   - Use WSS (WebSocket Secure) in production
   - Implement proper error handling
   - Handle disconnections gracefully

## Error Handling
- Server sends Error messages for invalid operations
- Clients should implement reconnection logic
- Handle timeout and network errors
- Validate all incoming/outgoing messages

## Best Practices
1. Implement heartbeat mechanism
2. Handle reconnection automatically
3. Buffer messages during disconnection
4. Validate message format before sending
5. Implement proper error handling
6. Use secure WebSocket (WSS) in production
7. Store encryption keys securely
8. Clean up resources on disconnect
