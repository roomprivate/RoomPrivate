mod crypto;
mod room;
mod messages;
mod server;
mod files;

use warp::Filter;
use server::Server;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    env_logger::init();
    
    let server = Server::new().await;
    let server = Arc::new(server);
    let server = Arc::clone(&server);

    let ws_route = {
        let server = Arc::clone(&server);
        warp::path("ws")
            .and(warp::ws())
            .map(move |ws: warp::ws::Ws| {
                let server = Arc::clone(&server);
                ws.on_upgrade(move |socket| {
                    let server = Arc::clone(&server);
                    async move {
                        server.handle_connection(socket).await;
                    }
                })
            })
    };

    let files_route = {
        let server = Arc::clone(&server);
        warp::path("files")
            .and(warp::path::param())
            .and_then(move |file_id: String| {
                let server = Arc::clone(&server);
                async move {
                    if let Some((metadata, content)) = server.get_file(&file_id).await {
                        let response = warp::http::Response::builder()
                            .header("Content-Type", metadata.mime_type)
                            .header("Content-Disposition", format!("inline; filename=\"{}\"", metadata.name))
                            .body(content)
                            .unwrap();
                        Ok(response)
                    } else {
                        Err(warp::reject::not_found())
                    }
                }
            })
    };

    let routes = ws_route
        .or(files_route)
        .with(warp::cors().allow_any_origin());

    println!("Starting HTTP server on port 2052...");
    warp::serve(routes)
        .run(([0, 0, 0, 0], 2052))
        .await;
}

#[derive(Debug)]
struct UploadError(String);

impl warp::reject::Reject for UploadError {}

impl From<String> for UploadError {
    fn from(error: String) -> Self {
        UploadError(error)
    }
}
