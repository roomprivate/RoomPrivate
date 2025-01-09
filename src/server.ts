import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import https, { Server as HttpsServer } from 'https';
import { PrivDB } from './services/PrivDB';
import * as CryptoJS from 'crypto-js';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { accessLoggerMiddleware } from './middleware/accessLogger';
import { AccessLogService } from './services/accessLogService';
import { spawn } from 'child_process';
import { Room, RoomMember } from './entities/Room';

dotenv.config();

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(accessLoggerMiddleware);
app.use(express.static(path.join(__dirname, '../public')));

// Try to load SSL certificates
let server: HttpServer | HttpsServer;
try {
    const options = {
        key: fs.readFileSync('/etc/ssl/room/private.key'),
        cert: fs.readFileSync('/etc/ssl/room/certificate.pem'),
    };
    server = https.createServer(options, app);
    logger.info('HTTPS server created successfully');
} catch (error) {
    logger.info('SSL certificates not found, falling back to HTTP');
    server = createServer(app);
}

// Track rooms and their members
const rooms = new Map();

// WebSocket setup
const wss = new WebSocket.Server({ server });

// Track clients and their rooms
const clients = new Map();

wss.on('connection', (ws: WebSocket) => {
    const socketId = uuidv4();
    clients.set(socketId, ws);
    
    // Send connection confirmation
    ws.send(JSON.stringify({
        event: 'connection',
        data: { socketId }
    }));

    // Handle messages from clients
    ws.on('message', (message: string) => {
        try {
            const { event, data } = JSON.parse(message.toString());
            logger.info('Received message:', { event, data });

            // For room creation, send immediate confirmation
            if (event === 'create-room') {
                const roomId = data.roomId || uuidv4();
                const room = {
                    id: roomId,
                    name: data.roomName,
                    description: data.description || '',
                    maxMembers: data.maxMembers || 0,
                    members: [{
                        userId: socketId,
                        username: data.username,
                        status: 'online'
                    }],
                    messages: []
                };
                
                rooms.set(roomId, room);
                
                ws.send(JSON.stringify({
                    event: 'room-created',
                    data: room
                }));
            }

            // For join room, send immediate confirmation and notify others
            if (event === 'join-room') {
                const room = rooms.get(data.roomId);
                if (room) {
                    const newMember = {
                        userId: socketId,
                        username: data.username,
                        status: 'online'
                    };
                    
                    // Check max members
                    if (room.maxMembers > 0 && room.members.length >= room.maxMembers) {
                        ws.send(JSON.stringify({
                            event: 'error',
                            data: { message: 'Room is full' }
                        }));
                        return;
                    }
                    
                    // Add member to room
                    room.members.push(newMember);
                    
                    // Send join confirmation to new member
                    ws.send(JSON.stringify({
                        event: 'room-joined',
                        data: room
                    }));
                    
                    // Notify other members
                    room.members.forEach((member: RoomMember) => {
                        if (member.userId !== socketId) {
                            const client = clients.get(member.userId);
                            if (client && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    event: 'member-joined',
                                    data: {
                                        roomId: room.id,
                                        member: newMember,
                                        members: room.members,
                                        maxMembers: room.maxMembers
                                    }
                                }));
                            }
                        }
                    });
                } else {
                    ws.send(JSON.stringify({
                        event: 'error',
                        data: { message: 'Room not found' }
                    }));
                }
            }

            // For message events, broadcast to all clients in the room
            if (event === 'message' && data.roomId) {
                const room = rooms.get(data.roomId);
                if (room) {
                    const messageData = {
                        event: 'message',
                        data: {
                            content: data.content,
                            sender: data.sender,
                            roomId: data.roomId,
                            timestamp: data.timestamp,
                            mentions: data.mentions || []
                        }
                    };

                    // Store message in room
                    room.messages.push(messageData.data);

                    // Send to all members in the room except sender
                    room.members.forEach((member: RoomMember) => {
                        if (member.userId !== socketId) {
                            const client = clients.get(member.userId);
                            if (client && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify(messageData));
                            }
                        }
                    });
                }
            }
        } catch (error) {
            logger.error('Error handling message:', error);
            ws.send(JSON.stringify({
                event: 'error',
                data: { message: 'Failed to process message' }
            }));
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        logger.info('Client disconnected', { socketId });
        
        // Remove from all rooms and notify other members
        rooms.forEach((room, roomId) => {
            const memberIndex = room.members.findIndex((m: RoomMember) => m.userId === socketId);
            if (memberIndex !== -1) {
                const member = room.members[memberIndex];
                room.members.splice(memberIndex, 1);
                
                // Notify remaining members
                room.members.forEach((m: RoomMember) => {
                    const client = clients.get(m.userId);
                    if (client && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            event: 'member-left',
                            data: {
                                roomId,
                                userId: socketId,
                                members: room.members
                            }
                        }));
                    }
                });
                
                // Remove room if empty
                if (room.members.length === 0) {
                    rooms.delete(roomId);
                }
            }
        });
        
        clients.delete(socketId);
    });
});

// Handle process termination
process.on('SIGINT', () => {
    logger.info('Received SIGINT. Cleaning up...');
    cleanup();
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Cleaning up...');
    cleanup();
});

// Cleanup function
function cleanup() {
    logger.info('Starting cleanup process...');
    
    // Close WebSocket server
    wss.close(() => {
        logger.info('WebSocket server closed');
    });

    // Close HTTP/HTTPS server
    server.close(() => {
        logger.info('HTTP/HTTPS server closed');
        // Exit the process after a short delay to allow logs to be written
        setTimeout(() => {
            process.exit(0);
        }, 100);
    });
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
    const protocol = server instanceof https.Server ? 'HTTPS' : 'HTTP';
    logger.info(`Server running on ${protocol} port ${port}`);
});
