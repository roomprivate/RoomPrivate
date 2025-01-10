import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import https, { Server as HttpsServer } from 'https';
import { PrivDB } from '../dist/services/PrivDB';
import * as CryptoJS from 'crypto-js';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { accessLoggerMiddleware } from './middleware/accessLogger';
import { AccessLogService } from './services/accessLogService';
import { spawn } from 'child_process';
import { Room, RoomMember } from './entities/Room';
import { E2EEncryption, EncryptedMessage } from './utils/e2eEncryption';

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
const rooms = new Map<string, Room>();

// Log active rooms every minute
setInterval(() => {
    logger.info('Active rooms:', {
        count: rooms.size,
        rooms: Array.from(rooms.entries()).map(([id, room]) => ({
            id,
            name: room.name,
            memberCount: room.getMemberCount()
        }))
    });
}, 60000);

// WebSocket setup
const wss = new WebSocket.Server({ server });

// Track clients and their rooms
const clients = new Map<string, WebSocket>();

wss.on('connection', (ws: WebSocket) => {
    const socketId: string = uuidv4();
    
    clients.set(socketId, ws);
    
    // Send connection confirmation
    ws.send(JSON.stringify({
        event: 'connected',
        data: { socketId }
    }));

    // Handle messages from clients
    ws.on('message', (message: string) => {
        try {
            const { event, data } = JSON.parse(message.toString());
            logger.info('Received message:', { event, data });

            if (event === 'create-room') {
                try {
                    const { username, roomName, description, maxMembers, password } = data;
                    const keyPair = E2EEncryption.generateRoomKeyPair();
                    const room = new Room(uuidv4(), roomName || username + "'s Room", keyPair, description, maxMembers, password);
                    
                    // Add creator as first member
                    const memberKeyPair = E2EEncryption.generateRoomKeyPair();
                    room.addMember(socketId, username, memberKeyPair.publicKey);
                    
                    rooms.set(room.id, room);
                    logger.info('Room created:', { 
                        roomId: room.id, 
                        name: room.name, 
                        creator: username,
                        creatorId: socketId,
                        memberCount: room.getMemberCount()
                    });
                    
                    // Send room info with encrypted room key
                    ws.send(JSON.stringify({
                        event: 'room-created',
                        data: {
                            ...room.toJSON(),
                            privateKey: memberKeyPair.privateKey,
                            roomKey: room.getMemberKey(socketId)
                        }
                    }));
                } catch (error) {
                    logger.error('Error creating room:', error);
                    ws.send(JSON.stringify({
                        event: 'error',
                        data: { message: 'Failed to create room' }
                    }));
                }
            }

            if (event === 'join-room') {
                const { roomId, username } = data;
                logger.info('Join room attempt:', { roomId, username, socketId });
                
                const room = rooms.get(roomId);
                logger.info('Found room:', { 
                    exists: !!room, 
                    roomDetails: room ? {
                        id: room.id,
                        name: room.name,
                        memberCount: room.getMemberCount()
                    } : null
                });
                
                if (room) {
                    if (room.maxMembers > 0 && room.getMemberCount() >= room.maxMembers) {
                        ws.send(JSON.stringify({
                            event: 'error',
                            data: { message: 'Room is full' }
                        }));
                        return;
                    }

                    // Generate key pair for new member
                    const memberKeyPair = E2EEncryption.generateRoomKeyPair();
                    room.addMember(socketId, username, memberKeyPair.publicKey);
                    
                    logger.info('Member joined room:', { 
                        roomId, 
                        username,
                        socketId,
                        newMemberCount: room.getMemberCount()
                    });
                    
                    // Send room info to new member with their encrypted room key
                    ws.send(JSON.stringify({
                        event: 'room-joined',
                        data: {
                            ...room.toJSON(),
                            privateKey: memberKeyPair.privateKey,
                            roomKey: room.getMemberKey(socketId)
                        }
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
                                        member: { userId: socketId, username },
                                        members: room.members,
                                        maxMembers: room.maxMembers
                                    }
                                }));
                            }
                        }
                    });
                } else {
                    logger.warn('Room not found:', { roomId });
                    ws.send(JSON.stringify({
                        event: 'error',
                        data: { message: 'Room not found' }
                    }));
                }
            }

            if (event === 'message') {
                const { roomId, encryptedContent, iv } = data;
                const room = rooms.get(roomId);
                
                if (!room) {
                    logger.warn('Message sent to non-existent room:', { roomId });
                    ws.send(JSON.stringify({
                        event: 'error',
                        data: { message: 'Room not found' }
                    }));
                    return;
                }
                
                if (!room.isMember(socketId)) {
                    logger.warn('Message sent by non-member:', { roomId, socketId });
                    ws.send(JSON.stringify({
                        event: 'error',
                        data: { message: 'You are not a member of this room' }
                    }));
                    return;
                }

                const messageData = {
                    encryptedContent,
                    iv
                };

                logger.info('Broadcasting encrypted message:', { 
                    roomId,
                    recipientCount: room.getMemberCount() - 1
                });

                // Send to all members in the room except sender
                room.members.forEach((member: RoomMember) => {
                    if (member.userId !== socketId) {
                        const client = clients.get(member.userId);
                        if (client && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                event: 'message',
                                data: messageData
                            }));
                        }
                    }
                });

                // Send confirmation back to sender
                ws.send(JSON.stringify({
                    event: 'message-sent',
                    data: messageData
                }));
            }
            // Handle client disconnection
            ws.on('close', () => {
                logger.info('Client disconnected', { socketId });
                
                // Remove from all rooms and notify other members
                rooms.forEach((room, roomId) => {
                    const member = room.members.find(m => m.userId === socketId);
                    if (member) {
                        // Remove member from room
                        room.members = room.members.filter(m => m.userId !== socketId);
                        
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
                    }
                });
                
                // Remove from clients map
                clients.delete(socketId);
            });
        } catch (error) {
            logger.error('Error handling message:', error);
            ws.send(JSON.stringify({
                event: 'error',
                data: { message: 'Failed to process message' }
            }));
        }
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
