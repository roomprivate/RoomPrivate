mod crypto;
mod room;
mod messages;
mod server;

use warp::Filter;
use server::Server;

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

    println!("Server starting on port 2052...");
    warp::serve(routes)
        .run(([0, 0, 0, 0], 2052))
        .await;
}
