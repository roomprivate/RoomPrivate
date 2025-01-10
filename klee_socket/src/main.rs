mod models;
mod socket_handler;

use log::{error, info};
use socket_handler::SocketHandler;
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use uuid::Uuid;

#[tokio::main]
async fn main() {
    // Initialize logging with debug level
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Debug)
        .init();

    let addr = "127.0.0.1:3003";
    info!("Attempting to bind to {}", addr);
    
    match TcpListener::bind(&addr).await {
        Ok(listener) => {
            info!("WebSocket server successfully bound and listening on: {}", addr);

            let socket_handler = SocketHandler::new();
            info!("SocketHandler initialized");

            while let Ok((stream, _)) = listener.accept().await {
                match stream.peer_addr() {
                    Ok(peer) => {
                        info!("New connection from peer address: {}", peer);
                        tokio::spawn(handle_connection(peer, stream, socket_handler.clone()));
                    }
                    Err(e) => error!("Failed to get peer address: {}", e),
                }
            }
        }
        Err(e) => {
            error!("Failed to bind to {}: {}", addr, e);
            std::process::exit(1);
        }
    }
}

async fn handle_connection(peer: SocketAddr, stream: TcpStream, socket_handler: SocketHandler) {
    let socket_id = Uuid::new_v4().to_string();
    info!("New WebSocket connection: {} ({})", socket_id, peer);

    match accept_async(stream).await {
        Ok(ws_stream) => {
            info!("WebSocket handshake successful for {}", socket_id);

            // Store the connection in the handler
            socket_handler.store_connection(&socket_id, ws_stream).await;
            info!("Connection stored for {}", socket_id);

            // Send initial connection event with socket_id
            let connection_message = serde_json::json!({
                "event": "connection",
                "data": {
                    "socketId": socket_id
                }
            });

            if let Err(e) = socket_handler.send_to_socket(&socket_id, "connection", connection_message["data"].clone()).await {
                error!("Failed to send connection message to {}: {}", socket_id, e);
                return;
            }
            info!("Connection message sent to {}", socket_id);

            // Handle messages
            loop {
                match socket_handler.receive_message(&socket_id).await {
                    Ok(Some(Message::Text(text))) => {
                        info!("Received text message from {}: {}", socket_id, text);
                        match serde_json::from_str(&text) {
                            Ok(json) => {
                                if let Err(e) = socket_handler.handle_message(&socket_id, json).await {
                                    error!("Error handling message from {}: {}", socket_id, e);
                                }
                            }
                            Err(e) => error!("Error parsing message from {}: {}", socket_id, e),
                        }
                    }
                    Ok(Some(Message::Close(_))) => {
                        info!("Received close message from {}", socket_id);
                        break;
                    }
                    Ok(Some(_)) => {
                        // Ignore other message types
                    }
                    Ok(None) => {
                        error!("Connection closed for {}", socket_id);
                        break;
                    }
                    Err(e) => {
                        error!("Error receiving message from {}: {}", socket_id, e);
                        break;
                    }
                }
            }

            // Handle disconnection
            info!("Handling disconnect for {}", socket_id);
            if let Err(e) = socket_handler.handle_message(&socket_id, serde_json::json!({
                "event": "disconnect",
                "data": { "socketId": socket_id }
            })).await {
                error!("Error handling disconnect for {}: {}", socket_id, e);
            }
            info!("Connection {} closed", socket_id);
        }
        Err(e) => error!("Failed WebSocket handshake for {}: {}", socket_id, e),
    }
}
