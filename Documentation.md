# Project Documentation

## Overview
This project consists of a Node.js server using Express and a Rust application using Tokio for WebSocket handling. The system is designed to manage real-time communication through WebSockets, allowing users to create and join chat rooms with secure messaging.

## Technologies Used
- **Node.js**: Backend server using Express for HTTP handling.
- **Express**: Middleware and routing.
- **WebSocket**: Real-time communication.
- **Rust**: WebSocket server using Tokio.
- **Tokio**: Asynchronous runtime for Rust.
- **CryptoJS**: Encryption for secure messaging.
- **UUID**: Unique identifiers for users and connections.
- **HTTPS**: Secure communication with SSL certificates.
- **CORS**: Cross-Origin Resource Sharing.

## Node.js Server (`server.ts`)
### HTTP Server
- **Static Files**: Serves static content from the `public` directory, including HTML, CSS, and JavaScript files.
- **JSON Requests**: Handles JSON request bodies.
- **Access Logs**: Logs all incoming requests using a middleware.
- **CORS**: Configured to allow all origins and specific methods and headers.

### WebSocket Server
- **Setup**: Initializes WebSocket server with custom settings.
- **Endpoints**:
  - **`/create-room`**: Create a new chat room.
  - **`/join-room`**: Join an existing chat room.
  - **`/message`**: Send a message to a room.
- **Room Management**: Create, join, and manage chat rooms.
- **Heartbeat**: Maintains active connections with regular pings.
- **Disconnection**: Handles client disconnections and room updates.

### WebSocket Events
- **`connection`**: Establishes a new WebSocket connection, assigns a unique `socketId`. The server listens for incoming connections and sets up a heartbeat mechanism to keep the connection alive.
- **`create-room`**: Allows a user to create a new chat room. The server generates a unique room ID and adds the creator as the first member. It sends back room details, including the encrypted room key and the creator's private key.
- **`join-room`**: Enables a user to join an existing room. The server checks if the room exists and if it has space for new members. It sends room details to the new member and notifies other members of the new addition.
- **`message`**: Handles the broadcasting of encrypted messages to all members of a room, except the sender. The server confirms the message delivery to the sender.
- **`disconnect`**: Manages client disconnection by removing the user from all rooms they are part of and notifying other members.

## Rust WebSocket Server (`main.rs` and `socket_handler.rs`)
### WebSocket Connection
- **Initialization**: Binds to a specified address and listens for incoming connections, setting up the WebSocket handshake process.
- **Connection Management**: Utilizes a `SocketHandler` to store active connections and manage the flow of messages between clients.

### SocketHandler
- **`store_connection`**: Saves a new WebSocket connection in a concurrent-safe manner using a mutex to ensure thread safety.
- **`send_to_socket`**: Sends a JSON-formatted message to a specific socket, including the event type and associated data.
- **`receive_message`**: Listens for and retrieves messages from a socket, handling different message types appropriately.
- **`handle_message`**: Processes incoming messages based on the event type, delegating to specific handlers for each event.

### Events
- **`register-public-key`**: Registers a user's public key for secure communication. The server stores the public key along with the user's information.
- **`create-room`**: Creates a new room, assigns a unique ID, and adds the creator as the first member. The server sends a confirmation message with room details to the creator.
- **`join-room`**: Adds a user to an existing room, updating the room's member list and notifying all members of the new addition.
- **`leave-room`**: Removes a user from a room, updates the member list, and notifies remaining members of the user's departure.
- **`message`**: Handles the delivery of messages within a room, ensuring that only members receive the messages.
- **`disconnect`**: Cleans up resources and notifies other users when a client disconnects from the server.

### Message Handling
- **Receive Messages**: Parses incoming messages in JSON format.
- **Process Events**: Handles different events like `connection`, `message`, and `disconnect`.

### Disconnection
- **Handle Disconnect**: Cleans up and logs disconnection events.

## Data Models (`models.rs`)
- **User**: Represents a user with attributes such as `socket_id`, `username`, `public_key`, and `status`, which indicate the user's online status.
- **Room**: Represents a chat room with attributes including `id`, `name`, `users`, `description`, `max_members`, and `password`, allowing for optional password protection and member limits.
- **Message**: Represents a chat message with attributes such as `id`, `room_id`, `sender_id`, `sender_name`, `content`, `timestamp`, and `mentions`, supporting message tagging and chronological ordering.

## Security
- **Encryption**: Uses CryptoJS for end-to-end encryption of messages.
- **SSL Certificates**: Attempts to use HTTPS by loading certificates.

## Conclusion
This documentation provides an overview of the system architecture, key components, and technologies used in the project. The system is designed for secure and efficient real-time communication using WebSockets.
