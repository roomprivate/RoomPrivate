FROM rust:1.85-slim-bullseye as builder

WORKDIR /usr/src/app
COPY . .

RUN cargo build --release

FROM debian:bullseye-slim

WORKDIR /usr/local/bin

COPY --from=builder /usr/src/app/target/release/room_private .

COPY --from=builder /usr/src/app/public ./public

CMD apt-get install pkg-config libssl-dev

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 2052

ENV PORT=2052

CMD ["./room_private"]
