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
            const userPublicKey = userKeys.get(socket.id);
            if (!userPublicKey) {
                logger.error('No encryption key registered for socket', { socketId: socket.id });
                socket.emit('error', { message: 'No encryption key registered. Please refresh the page.' });
                return;
            }

            const privDB = await PrivDB.getInstance();
            const room = await privDB.getRoom(roomId);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }

            if (room.hasPassword() && !room.validatePassword(password)) {
                socket.emit('error', { message: 'Invalid password' });
                return;
            }

            const userId = await UserIdentifier.generateUserId(username, socket.handshake.address, persistentKey);
            
            const connectedMembers = rooms.get(roomId) || new Map();
            const existingConnectedUser = Array.from(connectedMembers.values()).find(u => 
                u.username.toLowerCase() === username.toLowerCase() &&
                (!persistentKey || u.persistentId !== userId)
            );
            
            const existingRoomMember = Object.values(room.members).find(m => 
                m.userId !== userId && 
                m.username?.toLowerCase() === username.toLowerCase()
            );

            if (existingConnectedUser || existingRoomMember) {
                socket.emit('error', { message: 'Username already taken in this room' });
                return;
            }

            if (!room.addMember(userId, username)) {
                socket.emit('error', { message: 'Room is full' });
                return;
            }

            if (!rooms.has(roomId)) {
                rooms.set(roomId, new Map());
            }

            rooms.get(roomId)!.set(userId, {
                username,
                roomId,
                socketId: socket.id,
                persistentId: persistentKey ? userId : undefined,
                publicKey: userPublicKey
            });

            socket.join(roomId);
            
            await privDB.updateRoom(room);

            const userRoles = room.getMemberRoles(userId);
            const connectedUsers = Array.from(rooms.get(roomId)!.values()).map(u => u.username);

            const roomInfo = {
                userId,
                roomKey: room.encryptedRoomKey,
                roomName: room.name,
                description: room.description,
                maxMembers: room.maxMembers,
                currentMembers: connectedUsers.length,
                members: connectedUsers,
                roles: room.roles,
                userRoles
            };

            const encryptedRoomInfo = encryptForUser(roomInfo, userPublicKey);
            socket.emit('joined-room', encryptedRoomInfo);

            const notification = {
                userId,
                username,
                members: connectedUsers,
                currentMembers: connectedUsers.length,
                roles: userRoles
            };

            for (const member of connectedMembers.values()) {
                if (member.socketId !== socket.id && member.publicKey) {
                    const encryptedNotification = encryptForUser(notification, member.publicKey);
                    socket.to(member.socketId).emit('user-joined', encryptedNotification);
                }
            }

            logger.info(`User ${userId} joined room ${roomId}`);
        } catch (error) {
            logger.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room. Please try again.' });
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
