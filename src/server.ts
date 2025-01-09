import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { PrivDB } from './services/PrivDB';
import * as CryptoJS from 'crypto-js';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { Permission } from './entities/Room';
import { UserIdentifier } from './utils/userIdentifier';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

interface User {
    username: string;
    roomId: string;
    socketId: string;
    persistentId?: string;
    publicKey?: string;  
}

const rooms = new Map<string, Map<string, User>>();
const userKeys = new Map<string, string>();  

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

io.on('connection', (socket) => {
    logger.info('New client connected', { socketId: socket.id });

    socket.on('register-key', ({ publicKey }) => {
        if (!publicKey) {
            logger.error('No public key provided during registration');
            return;
        }
        try {
            userKeys.set(socket.id, publicKey);
            logger.info('Public key registered for socket', { socketId: socket.id });
        } catch (error) {
            logger.error('Error registering public key:', error);
        }
    });

    socket.on('create-room', async ({ 
        hasPassword, 
        password, 
        description, 
        maxMembers,
        username,
        persistentKey 
    }) => {
        try {
            const db = await PrivDB.getInstance();
            const room = await db.createRoom(
                hasPassword, 
                password, 
                description, 
                maxMembers,
                socket.handshake.address,
                username,
                persistentKey
            );
            
            if (!room) {
                socket.emit('error', { message: 'Failed to create room' });
                return;
            }

            rooms.set(room.id, new Map());

            socket.emit('room-created', {
                roomId: room.id, 
                encryptedRoomKey: room.encryptedRoomKey
            });

            logger.info(`Room ${room.id} created by ${username}`);
        } catch (error) {
            logger.error('Error creating room:', error);
            socket.emit('error', { message: 'Failed to create room' });
        }
    });

    socket.on('join-room', async ({ roomId, username, password, persistentKey }) => {
        try {
            const db = await PrivDB.getInstance();
            const room = await db.getRoom(roomId);
            
            if (!room) {
                throw new Error('Room not found');
            }

            // Check password if room has one
            if (room.encryptedPassword) {
                const hashedPassword = CryptoJS.SHA256(password).toString();
                if (hashedPassword !== room.encryptedPassword) {
                    throw new Error('Invalid password');
                }
            }

            const userId = await UserIdentifier.generateUserId(username, socket.handshake.address, persistentKey);
            const userPublicKey = userKeys.get(socket.id);

            if (!userPublicKey) {
                throw new Error('User public key not found');
            }

            if (!rooms.has(roomId)) {
                rooms.set(roomId, new Map());
            }

            const roomUsers = rooms.get(roomId)!;
            roomUsers.set(userId, {
                username,
                roomId,
                socketId: socket.id,
                persistentId: persistentKey,
                publicKey: userPublicKey
            });

            // Join the socket room
            socket.join(roomId);

            // Store the room ID in the socket for later use
            socket.data.roomId = roomId;

            // Prepare room data for the new user
            const roomData = {
                userId,
                roomId,
                roomKey: room.encryptedRoomKey,
                roomName: room.name,
                description: room.description,
                maxMembers: room.maxMembers,
                currentMembers: roomUsers.size,
                members: Array.from(roomUsers.values()).map(u => u.username)
            };

            // Send encrypted room data to the new user
            const encryptedData = encryptForUser(roomData, userPublicKey);
            socket.emit('joined-room', encryptedData);

            // Notify other users about the new member
            const notification = {
                userId,
                username,
                members: roomData.members,
                currentMembers: roomData.currentMembers
            };

            for (const [_, user] of roomUsers) {
                if (user.socketId !== socket.id && user.publicKey) {
                    const encryptedNotification = encryptForUser(notification, user.publicKey);
                    socket.to(user.socketId).emit('user-joined', encryptedNotification);
                }
            }

            logger.info(`User ${userId} joined room ${roomId}`);
        } catch (error: any) {
            logger.error('Error joining room:', error);
            socket.emit('error', { message: error.message || 'Failed to join room' });
        }
    });

    socket.on('message', async ({ roomId, content }) => {
        try {
            // First check if the room exists in memory
            const roomUsers = rooms.get(roomId);
            if (!roomUsers) {
                throw new Error('Room not found');
            }

            // Find the sender in the room
            const sender = Array.from(roomUsers.values()).find(user => user.socketId === socket.id);
            if (!sender) {
                throw new Error('User not found in room');
            }

            // Send message to all users in the room
            for (const [_, user] of roomUsers) {
                const userPublicKey = userKeys.get(user.socketId);
                if (userPublicKey) {
                    const encryptedMessage = encryptForUser({
                        type: 'message',
                        content,
                        sender: sender.username,
                        timestamp: new Date().toISOString()
                    }, userPublicKey);
                    
                    io.to(user.socketId).emit('message', encryptedMessage);
                }
            }

            logger.info(`Message sent in room ${roomId} by ${sender.username}`);
        } catch (error: any) {
            logger.error('Error sending message:', error);
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('disconnect', async () => {
        try {
            userKeys.delete(socket.id);
            
            for (const [roomId, members] of rooms.entries()) {
                const userEntry = Array.from(members.entries()).find(([_, user]) => user.socketId === socket.id);
                if (userEntry) {
                    const [userId, user] = userEntry;
                    members.delete(userId);
                    
                    const privDB = await PrivDB.getInstance();
                    const room = await privDB.getRoom(roomId);
                    if (room) {
                        delete room.members[userId];
                        await privDB.updateRoom(room);
                        
                        const remainingMembers = Array.from(members.values()).map(u => u.username);
                        const notification = {
                            userId,
                            members: remainingMembers,
                            currentMembers: remainingMembers.length
                        };
                        
                        for (const member of members.values()) {
                            if (member.publicKey) {
                                const encryptedNotification = encryptForUser(notification, member.publicKey);
                                socket.to(member.socketId).emit('user-left', encryptedNotification);
                            }
                        }
                        
                        logger.info(`User ${userId} left room ${roomId}`);
                    }
                    break;
                }
            }
        } catch (error) {
            logger.error('Error handling disconnect:', error);
        }
    });
});

const port = process.env.PORT || 3000;
httpServer.listen(port, () => {
    logger.info(`Server running on port ${port}`);
});
