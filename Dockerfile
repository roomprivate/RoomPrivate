# Build stage
FROM rust:1.84-slim-bullseye as builder

WORKDIR /usr/src/app
COPY . .

# Build the application in release mode
RUN cargo build --release

# Runtime stage
FROM debian:bullseye-slim

WORKDIR /usr/local/bin

# Copy the built binary from builder
COPY --from=builder /usr/src/app/target/release/room_private .

# Create SSL directory and copy certificates
RUN mkdir -p /etc/ssl/room
COPY ssl/room/* /etc/ssl/room/

# Copy the public directory
COPY --from=builder /usr/src/app/public ./public

# Install necessary runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Expose the port your application uses
EXPOSE 2052

# Set environment variable for the port
ENV PORT=2052

# Set the binary as the entrypoint
CMD ["./room_private"]
