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
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    const messageKey = CryptoJS.lib.WordArray.random(256 / 8);
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
    logger_1.logger.info('New client connected', { socketId: socket.id });
    socket.on('register-key', ({ publicKey }) => {
        userKeys.set(socket.id, CryptoJS.enc.Base64.parse(publicKey));
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
            const privDB = await PrivDB_1.PrivDB.getInstance();
            const room = await privDB.getRoom(roomId);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            if (room.hasPassword() && !room.validatePassword(password)) {
                socket.emit('error', { message: 'Invalid password' });
                return;
            }
            const userId = userIdentifier_1.UserIdentifier.generateUserId(username, socket.handshake.address, persistentKey);
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
            rooms.get(roomId).set(userId, {
                username,
                roomId,
                socketId: socket.id,
                persistentId: persistentKey ? userId : undefined,
                publicKey: userKeys.get(socket.id)?.toString()
            });
            socket.join(roomId);
            await privDB.updateRoom(room);
            const userRoles = room.getMemberRoles(userId);
            const connectedUsers = Array.from(rooms.get(roomId).values()).map(u => u.username);
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
            }
            else {
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
                    socket.to(member.socketId).emit('user-joined', encryptForUser(notification, member.publicKey));
                }
            }
            logger_1.logger.info(`User ${userId} joined room ${roomId}`);
        }
        catch (error) {
            logger_1.logger.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });
    socket.on('send-message', async ({ roomId, content }) => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        const sender = Array.from(room.values()).find(u => u.socketId === socket.id);
        if (!sender)
            return;
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
                }
                else {
                    const notification = {
                        userId,
                        members: Array.from(members.values()).map(u => u.username),
                        currentMembers: members.size
                    };
                    for (const member of members.values()) {
                        if (member.publicKey) {
                            socket.to(member.socketId).emit('user-left', encryptForUser(notification, member.publicKey));
                        }
                    }
                }
                const privDB = await PrivDB_1.PrivDB.getInstance();
                const room = await privDB.getRoom(roomId);
                if (room) {
                    room.removeMember(userId);
                    await privDB.updateRoom(room);
                }
                socket.leave(roomId);
                logger_1.logger.info(`User ${userId} left room ${roomId}`);
            }
        }
        userKeys.delete(socket.id);
    });
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    logger_1.logger.info(`Server running on port ${PORT}`);
});
