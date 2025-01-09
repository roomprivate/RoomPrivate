"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const PrivDB_1 = require("./services/PrivDB");
const CryptoJS = __importStar(require("crypto-js"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
const userIdentifier_1 = require("./utils/userIdentifier");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const rooms = new Map();
const userKeys = new Map();
function encryptForUser(message, userPublicKey) {
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
    }
    catch (error) {
        logger_1.logger.error('Encryption error:', error);
        throw error;
    }
}
io.on('connection', (socket) => {
    logger_1.logger.info('New client connected', { socketId: socket.id });
    socket.on('register-key', ({ publicKey }) => {
        if (!publicKey) {
            logger_1.logger.error('No public key provided during registration');
            return;
        }
        try {
            userKeys.set(socket.id, publicKey);
            logger_1.logger.info('Public key registered for socket', { socketId: socket.id });
        }
        catch (error) {
            logger_1.logger.error('Error registering public key:', error);
        }
    });
    socket.on('create-room', async ({ hasPassword, password, description, maxMembers, username, persistentKey }) => {
        try {
            const db = await PrivDB_1.PrivDB.getInstance();
            const room = await db.createRoom(hasPassword, password, description, maxMembers, socket.handshake.address, username, persistentKey);
            if (!room) {
                socket.emit('error', { message: 'Failed to create room' });
                return;
            }
            rooms.set(room.id, new Map());
            socket.emit('room-created', {
                roomId: room.id,
                encryptedRoomKey: room.encryptedRoomKey
            });
            logger_1.logger.info(`Room ${room.id} created by ${username}`);
        }
        catch (error) {
            logger_1.logger.error('Error creating room:', error);
            socket.emit('error', { message: 'Failed to create room' });
        }
    });
    socket.on('join-room', async ({ roomId, username, password, persistentKey }) => {
        try {
            const db = await PrivDB_1.PrivDB.getInstance();
            const room = await db.getRoom(roomId);
            if (!room) {
                throw new Error('Room not found');
            }
            if (room.hasPassword && password !== room.password) {
                throw new Error('Invalid password');
            }
            const userId = userIdentifier_1.UserIdentifier.generate(username, persistentKey);
            const userPublicKey = userKeys.get(socket.id);
            if (!userPublicKey) {
                throw new Error('User public key not found');
            }
            if (!rooms.has(roomId)) {
                rooms.set(roomId, new Map());
            }
            const roomUsers = rooms.get(roomId);
            roomUsers.set(userId, {
                username,
                roomId,
                socketId: socket.id,
                persistentId: persistentKey,
                publicKey: userPublicKey
            });
            socket.join(roomId);
            // Prepare room data for the new user
            const roomData = {
                userId,
                roomId,
                roomKey: room.key,
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
            logger_1.logger.info(`User ${userId} joined room ${roomId}`);
        }
        catch (error) {
            logger_1.logger.error('Error joining room:', error);
            socket.emit('error', { message: error.message });
        }
    });
    socket.on('message', async ({ roomId, content }) => {
        try {
            const roomUsers = rooms.get(roomId);
            if (!roomUsers) {
                throw new Error('Room not found');
            }
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
        }
        catch (error) {
            logger_1.logger.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
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
                    const privDB = await PrivDB_1.PrivDB.getInstance();
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
                        logger_1.logger.info(`User ${userId} left room ${roomId}`);
                    }
                    break;
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling disconnect:', error);
        }
    });
});
const port = process.env.PORT || 3000;
httpServer.listen(port, () => {
    logger_1.logger.info(`Server running on port ${port}`);
});
