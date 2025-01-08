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
const userKeys = new Map<string, CryptoJS.lib.WordArray>();  

function encryptForUser(message: any, userPublicKey: string): string {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    const messageKey = CryptoJS.lib.WordArray.random(256/8);
    
    const encryptedMessage = CryptoJS.AES.encrypt(messageStr, messageKey, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    }).toString();
    
    const encryptedKey = CryptoJS.AES.encrypt(messageKey.toString(), userPublicKey, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    }).toString();
    
    return JSON.stringify({
        key: encryptedKey,
        message: encryptedMessage
    });
}

io.on('connection', (socket) => {
    logger.info('New client connected', { socketId: socket.id });

    socket.on('register-key', ({ publicKey }) => {
        userKeys.set(socket.id, CryptoJS.enc.Base64.parse(publicKey));
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

            const userId = UserIdentifier.generateUserId(username, socket.handshake.address, persistentKey);
            
            const connectedMembers = rooms.get(roomId) || new Map();
            if (Array.from(connectedMembers.values()).some(u => u.username === username)) {
                socket.emit('error', { message: 'Username already taken in this room' });
                return;
            }

            if (!room.addMember(userId)) {
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
                publicKey: userKeys.get(socket.id)?.toString()
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

            const userPublicKey = userKeys.get(socket.id)?.toString();
            if (userPublicKey) {
                socket.emit('joined-room', encryptForUser(roomInfo, userPublicKey));
            } else {
                socket.emit('error', { message: 'No encryption key registered' });
                return;
            }

            const notification = {
                userId,
                username,
                members: connectedUsers,
                currentMembers: connectedUsers.length,
                roles: userRoles
            };

            for (const member of connectedMembers.values()) {
                if (member.socketId !== socket.id && member.publicKey) {
                    socket.to(member.socketId).emit('user-joined', 
                        encryptForUser(notification, member.publicKey)
                    );
                }
            }

            logger.info(`User ${userId} joined room ${roomId}`);
        } catch (error) {
            logger.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on('send-message', async ({ roomId, content }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const sender = Array.from(room.values()).find(u => u.socketId === socket.id);
        if (!sender) return;

        for (const recipient of room.values()) {
            if (recipient.socketId !== socket.id && recipient.publicKey) {
                const encryptedContent = encryptForUser({
                    sender: sender.username,
                    content,
                    timestamp: Date.now()
                }, recipient.publicKey);

                socket.to(recipient.socketId).emit('message', encryptedContent);
            }
        }
    });

    socket.on('disconnect', async () => {
        for (const [roomId, members] of rooms.entries()) {
            const userEntry = Array.from(members.entries())
                .find(([_, user]) => user.socketId === socket.id);
            
            if (userEntry) {
                const [userId, user] = userEntry;
                members.delete(userId);

                if (members.size === 0) {
                    rooms.delete(roomId);
                } else {
                    const notification = {
                        userId,
                        members: Array.from(members.values()).map(u => u.username),
                        currentMembers: members.size
                    };

                    for (const member of members.values()) {
                        if (member.publicKey) {
                            socket.to(member.socketId).emit('user-left', 
                                encryptForUser(notification, member.publicKey)
                            );
                        }
                    }
                }

                const privDB = await PrivDB.getInstance();
                const room = await privDB.getRoom(roomId);
                if (room) {
                    room.removeMember(userId);
                    await privDB.updateRoom(room);
                }

                socket.leave(roomId);
                logger.info(`User ${userId} left room ${roomId}`);
            }
        }

        userKeys.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});
