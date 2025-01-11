mod crypto;
mod room;
mod messages;
mod server;

use std::fs::File;
use std::io::BufReader;
use rustls::{Certificate, PrivateKey, ServerConfig};
use rustls_pemfile::{certs, pkcs8_private_keys};
use warp::Filter;
use server::Server;

fn load_tls_config() -> Option<ServerConfig> {
    let cert_path = "ssl/room/certificate.pem";
    let key_path = "ssl/room/private.key";

    let cert_file = match File::open(cert_path) {
        Ok(file) => file,
        Err(e) => {
            eprintln!("Failed to open certificate file: {}", e);
            return None;
        }
    };
    let key_file = match File::open(key_path) {
        Ok(file) => file,
        Err(e) => {
            eprintln!("Failed to open private key file: {}", e);
            return None;
        }
    };

    let cert_reader = &mut BufReader::new(cert_file);
    let key_reader = &mut BufReader::new(key_file);

    let certs: Vec<Certificate> = match certs(cert_reader) {
        Ok(certs) => certs.into_iter().map(Certificate).collect(),
        Err(e) => {
            eprintln!("Failed to parse certificate: {}", e);
            return None;
        }
    };

    let keys: Vec<PrivateKey> = match pkcs8_private_keys(key_reader) {
        Ok(keys) => keys.into_iter().map(PrivateKey).collect(),
        Err(e) => {
            eprintln!("Failed to parse private key: {}", e);
            return None;
        }
    };

    let config = ServerConfig::builder()
        .with_safe_defaults()
        .with_no_client_auth();

    match config.with_single_cert(certs, keys[0].clone()) {
        Ok(config) => Some(config),
        Err(e) => {
            eprintln!("Failed to create TLS config: {}", e);
            None
        }
    }
}

#[tokio::main]
async fn main() {
    env_logger::init();
    
    let server = Server::new();
    let server = std::sync::Arc::new(server);

    let ws_route = warp::path("ws")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let server = server.clone();
            ws.on_upgrade(move |socket| {
                let server = server.clone();
                async move {
                    server.handle_connection(socket).await;
                }
            })
        });

    let static_files = warp::fs::dir("public");

    let routes = ws_route
        .or(static_files)
        .with(warp::cors().allow_any_origin());

<<<<<<< HEAD
    match load_tls_config() {
        Some(_) => {
            println!("Starting secure server (HTTPS/WSS) on port 2052...");
            warp::serve(routes)
                .tls()
                .cert_path("ssl/room/certificate.pem")
                .key_path("ssl/room/private.key")
                .run(([0, 0, 0, 0], 2052))
                .await;
        }
        None => {
            println!("Failed to load TLS config, falling back to HTTP/WS on port 2052...");
            warp::serve(routes)
                .run(([0, 0, 0, 0], 2052))
                .await;
        }
    }
=======
    println!("Server starting on port 2052...");
    warp::serve(routes)
        .run(([0, 0, 0, 0], 2052))
        .await;
>>>>>>> 00c1f4839a252783e3cac59c97d2ddf1744fdb95
}
