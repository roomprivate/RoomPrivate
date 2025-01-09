import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { PrivDB } from './services/PrivDB';
import * as CryptoJS from 'crypto-js';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.static(path.join(__dirname, '../public')));

// Try to load SSL certificates
let server;
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

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["*"],
        credentials: true
    },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    perMessageDeflate: {
        threshold: 2048 // Size in bytes, compression only for messages larger than this
    },
    cookie: {
        name: 'io',
        path: '/',
        httpOnly: true,
        sameSite: 'lax'
    }
});

interface User {
    socketId: string;
    username: string;
    publicKey: string;
    status?: string;
}

const rooms = new Map<string, Map<string, User>>();

function generateRoomId() {
    return uuidv4();
}

function generateRoomName() {
    return `Room ${uuidv4()}`;
}

function encryptForUser(message: any, userPublicKey: string): string {
    try {
        if (!userPublicKey) {
            throw new Error('No public key provided for encryption');
        }

        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
        const messageKey = CryptoJS.lib.WordArray.random(32).toString();
        
        const encryptedMessage = CryptoJS.AES.encrypt(messageStr, messageKey);
        if (!encryptedMessage) {
            throw new Error('Failed to encrypt message');
        }
        
        const encryptedKey = CryptoJS.AES.encrypt(messageKey, userPublicKey);
        if (!encryptedKey) {
            throw new Error('Failed to encrypt message key');
        }
        
        return JSON.stringify({
            key: encryptedKey.toString(),
            message: encryptedMessage.toString()
        });
    } catch (error) {
        logger.error('Encryption error:', error);
        throw error;
    }
}

function extractMentions(content: string, users: any[]): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
        const username = match[1];
        const user = users.find(u => u.username === username);
        if (user) {
            mentions.push(user.socketId);
        }
    }
    
    return mentions;
}

io.on('connection', (socket) => {
    logger.info('New client connected', { socketId: socket.id });

    socket.on('register-key', ({ publicKey }) => {
        if (!publicKey) {
            logger.error('No public key provided during registration');
            return;
        }
        try {
            // userKeys.set(socket.id, publicKey);
            logger.info('Public key registered for socket', { socketId: socket.id });
        } catch (error) {
            logger.error('Error registering public key:', error);
        }
    });

    socket.on('create-room', async ({ username, description, maxMembers, password, publicKey }) => {
        try {
            if (!username || !publicKey) {
                logger.warn('Missing required fields for create-room', { username, publicKey });
                return;
            }

            const db = await PrivDB.getInstance();
            const room = await db.createRoom({
                name: generateRoomName(),
                description,
                maxMembers,
                password
            });

            if (!room) {
                logger.error('Failed to create room in database');
                socket.emit('error', encryptForUser({ message: 'Failed to create room' }, publicKey));
                return;
            }

            // Add user to room
            room.addMember(socket.id, username);
            await db.updateRoom(room);

            // Create room in memory if it doesn't exist
            if (!rooms.has(room.id)) {
                rooms.set(room.id, new Map());
            }

            // Add user to room in memory
            const roomUsers = rooms.get(room.id)!;
            roomUsers.set(socket.id, {
                socketId: socket.id,
                username,
                publicKey
            });

            // Join socket room
            socket.join(room.id);
            socket.data.roomId = room.id;

            // Send room info back to creator
            const roomInfo = {
                roomId: room.id,
                userId: socket.id,
                name: room.name,
                description: room.description,
                encryptedRoomKey: room.encryptedRoomKey,
                members: Array.from(roomUsers.values()).map(u => ({
                    username: u.username,
                    userId: u.socketId,
                    status: 'online'
                }))
            };

            socket.emit('room-created', encryptForUser(roomInfo, publicKey));
            logger.info('Room created successfully', { roomId: room.id, userId: socket.id });

        } catch (error) {
            logger.error('Error creating room:', error);
            socket.emit('error', encryptForUser({ message: 'Failed to create room' }, publicKey));
        }
    });

    socket.on('join-room', async ({ roomId, username, password, publicKey }) => {
        try {
            if (!roomId || !username || !publicKey) {
                logger.warn('Missing required fields for join-room', { roomId, username });
                socket.emit('error', encryptForUser({ message: 'Missing required fields' }, publicKey));
                return;
            }

            const db = await PrivDB.getInstance();
            const room = await db.getRoom(roomId);

            if (!room) {
                logger.warn('Room not found', { roomId });
                socket.emit('error', encryptForUser({ message: 'Room not found' }, publicKey));
                return;
            }

            if (room.hasPassword() && !room.validatePassword(password || '')) {
                logger.warn('Invalid room password', { roomId });
                socket.emit('error', encryptForUser({ message: 'Invalid password' }, publicKey));
                return;
            }

            if (room.maxMembers > 0 && room.getMemberCount() >= room.maxMembers) {
                logger.warn('Room is full', { roomId });
                socket.emit('error', encryptForUser({ message: 'Room is full' }, publicKey));
                return;
            }

            // Add user to room
            room.addMember(socket.id, username);
            await db.updateRoom(room);

            // Create room in memory if it doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, new Map());
            }

            // Add user to room in memory
            const roomUsers = rooms.get(roomId)!;
            roomUsers.set(socket.id, {
                socketId: socket.id,
                username,
                publicKey,
                status: 'online'
            });

            // Join socket room
            socket.join(roomId);
            socket.data.roomId = roomId;

            // Notify other users in room with full user info
            socket.to(roomId).emit('user-joined', {
                username,
                userId: socket.id,
                status: 'online'
            });

            // Send room info back to user
            const roomInfo = {
                roomId: room.id,
                userId: socket.id,
                name: room.name,
                description: room.description,
                encryptedRoomKey: room.encryptedRoomKey,
                members: Array.from(roomUsers.values()).map(u => ({
                    username: u.username,
                    userId: u.socketId,
                    status: u.status
                }))
            };

            socket.emit('room-joined', encryptForUser(roomInfo, publicKey));
            logger.info('User joined room successfully', { roomId, userId: socket.id });

        } catch (error) {
            logger.error('Error joining room:', error);
            socket.emit('error', encryptForUser({ message: 'Failed to join room' }, publicKey));
        }
    });

    socket.on('leave-room', async ({ roomId }) => {
        try {
            if (!roomId) {
                logger.warn('No room ID provided for leave-room event');
                return;
            }

            const roomUsers = rooms.get(roomId);
            if (!roomUsers) {
                logger.warn('Room not found for leave-room event', { roomId });
                return;
            }

            // Find the user in the room
            let leavingUser: User | undefined;
            let userId: string | undefined;

            for (const [id, user] of roomUsers.entries()) {
                if (user.socketId === socket.id) {
                    leavingUser = user;
                    userId = id;
                    break;
                }
            }

            if (!leavingUser || !userId) {
                logger.warn('User not found in room', { roomId, socketId: socket.id });
                return;
            }

            // Remove user from memory
            roomUsers.delete(userId);

            // Leave the socket room
            socket.leave(roomId);

            // Clear room ID from socket data
            socket.data.roomId = undefined;

            // Notify other users in the room
            const notification = {
                userId,
                username: leavingUser.username,
                members: Array.from(roomUsers.values()).map(u => ({
                    username: u.username,
                    userId: u.socketId,
                    status: u.status
                }))
            };

            for (const [_, user] of roomUsers) {
                if (user.publicKey) {
                    const encryptedNotification = encryptForUser(notification, user.publicKey);
                    socket.to(user.socketId).emit('user-left', encryptedNotification);
                }
            }

            logger.info(`User ${userId} left room ${roomId}`);

            // If room is empty, delete it from both memory and database
            if (roomUsers.size === 0) {
                rooms.delete(roomId);
                const db = await PrivDB.getInstance();
                await db.deleteRoom(roomId);
                logger.info(`Room ${roomId} deleted - no more users`);
            }
        } catch (error) {
            logger.error('Error handling leave-room event:', error);
        }
    });

    socket.on('message', async ({ roomId, content, timestamp }) => {
        try {
            if (!socket.data.roomId || !roomId) {
                logger.warn('User not in room or room not specified');
                return;
            }

            const roomUsers = rooms.get(roomId);
            if (!roomUsers) {
                logger.warn('Room not found in memory', { roomId });
                return;
            }

            const user = roomUsers.get(socket.id);
            if (!user) {
                logger.warn('User not found in room', { roomId, socketId: socket.id });
                return;
            }

            // Prepare message data
            const messageData = {
                sender: user.username,
                senderId: socket.id,
                content,
                timestamp,
                mentions: extractMentions(content, Array.from(roomUsers.values()))
            };

            // Encrypt message for each recipient
            for (const [recipientId, recipient] of roomUsers.entries()) {
                const encryptedMessage = encryptForUser(messageData, recipient.publicKey);
                io.to(recipientId).emit('message', encryptedMessage);
            }

            logger.info('Message sent successfully', { roomId, sender: user.username });
        } catch (error) {
            logger.error('Error sending message:', error);
        }
    });

    socket.on('disconnect', async () => {
        try {
            logger.info('Client disconnected', { socketId: socket.id });

            // Find and leave any rooms the user was in
            for (const [roomId, roomUsers] of rooms.entries()) {
                let disconnectedUser: User | undefined;
                let userId: string | undefined;

                for (const [id, user] of roomUsers.entries()) {
                    if (user.socketId === socket.id) {
                        disconnectedUser = user;
                        userId = id;
                        break;
                    }
                }

                if (disconnectedUser && userId) {
                    // Skip if user already left the room properly
                    if (!socket.data.roomId) continue;

                    // Remove user from memory
                    roomUsers.delete(userId);

                    // Leave the socket room
                    socket.leave(roomId);

                    // Clear room ID from socket data
                    socket.data.roomId = undefined;

                    // Notify other users in the room
                    const notification = {
                        userId,
                        username: disconnectedUser.username,
                        members: Array.from(roomUsers.values()).map(u => ({
                            username: u.username,
                            userId: u.socketId,
                            status: u.status
                        }))
                    };

                    for (const [_, user] of roomUsers) {
                        if (user.publicKey) {
                            const encryptedNotification = encryptForUser(notification, user.publicKey);
                            io.to(user.socketId).emit('user-left', encryptedNotification);
                        }
                    }

                    logger.info(`User ${userId} disconnected from room ${roomId}`);

                    // If room is empty, delete it from both memory and database
                    if (roomUsers.size === 0) {
                        rooms.delete(roomId);
                        const db = await PrivDB.getInstance();
                        await db.deleteRoom(roomId);
                        logger.info(`Room ${roomId} deleted - no more users`);
                    }
                }
            }
        } catch (error) {
            logger.error('Error handling disconnect:', error);
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    const protocol = server instanceof https.Server ? 'HTTPS' : 'HTTP';
    logger.info(`Server running on ${protocol} port ${port}`);
});
