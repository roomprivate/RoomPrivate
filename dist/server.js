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
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const PrivDB_1 = require("./services/PrivDB");
const CryptoJS = __importStar(require("crypto-js"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
const uuid_1 = require("uuid");
const accessLogger_1 = require("./middleware/accessLogger");
const accessLogService_1 = require("./services/accessLogService"); // Import AccessLogService
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express_1.default.json()); // Add JSON body parser
app.use(accessLogger_1.accessLoggerMiddleware);
// API endpoint for client-side access logging
app.post('/api/log-access', async (req, res) => {
    try {
        const clientInfo = req.body;
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
            req.socket.remoteAddress ||
            'unknown';
        // Combine server-side and client-side information
        await accessLogService_1.AccessLogService.logAccess({
            userIp: ip,
            userGeoLoc: clientInfo.timezone || 'unknown',
            platform: `${clientInfo.platform || 'unknown'} (${clientInfo.screenResolution || 'unknown'}, ${clientInfo.colorDepth || 'unknown'}bit)`,
            device: `${clientInfo.hardwareConcurrency || 'unknown'}cores, ${clientInfo.deviceMemory || 'unknown'}GB RAM, ${clientInfo.connectionType || 'unknown'} connection`
        });
        res.status(200).json({ success: true });
    }
    catch (error) {
        console.error('Error logging access:', error);
        res.status(500).json({ success: false });
    }
});
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Try to load SSL certificates
let server;
try {
    const options = {
        key: fs_1.default.readFileSync('/etc/ssl/room/private.key'),
        cert: fs_1.default.readFileSync('/etc/ssl/room/certificate.pem'),
    };
    server = https_1.default.createServer(options, app);
    logger_1.logger.info('HTTPS server created successfully');
}
catch (error) {
    logger_1.logger.info('SSL certificates not found, falling back to HTTP');
    server = (0, http_1.createServer)(app);
}
const io = new socket_io_1.Server(server, {
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
const rooms = new Map();
function generateRoomId() {
    return (0, uuid_1.v4)();
}
function generateRoomName() {
    return `Room ${(0, uuid_1.v4)()}`;
}
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
function extractMentions(content, users) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
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
    logger_1.logger.info('New client connected', { socketId: socket.id });
    socket.on('register-public-key', async (publicKey) => {
        console.log('Public key registered for socket', { socketId: socket.id });
        await accessLogService_1.AccessLogService.logAccess({
            userIp: socket.handshake.address,
            userGeoLoc: socket.handshake.headers['x-geo-location'] || 'unknown',
            platform: socket.handshake.headers['user-agent'] || 'unknown',
            device: socket.handshake.headers['x-device-info'] || 'unknown'
        });
    });
    socket.on('create-room', async ({ username, description, maxMembers, password, publicKey }) => {
        try {
            if (!username || !publicKey) {
                logger_1.logger.warn('Missing required fields for create-room', { username, publicKey });
                return;
            }
            const db = await PrivDB_1.PrivDB.getInstance();
            const room = await db.createRoom({
                name: generateRoomName(),
                description,
                maxMembers,
                password
            });
            if (!room) {
                logger_1.logger.error('Failed to create room in database');
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
            const roomUsers = rooms.get(room.id);
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
                max: room.maxMembers === 0 ? '∞' : room.maxMembers,
                members: Array.from(roomUsers.values()).map(u => ({
                    username: u.username,
                    userId: u.socketId,
                    status: 'online'
                }))
            };
            socket.emit('room-created', encryptForUser(roomInfo, publicKey));
            logger_1.logger.info('Room created successfully', { roomId: room.id, userId: socket.id });
        }
        catch (error) {
            logger_1.logger.error('Error creating room:', error);
            socket.emit('error', encryptForUser({ message: 'Failed to create room' }, publicKey));
        }
    });
    socket.on('join-room', async ({ roomId, username, password, publicKey }) => {
        try {
            if (!roomId || !username || !publicKey) {
                logger_1.logger.warn('Missing required fields for join-room', { roomId, username });
                socket.emit('error', encryptForUser({ message: 'Missing required fields' }, publicKey));
                return;
            }
            const db = await PrivDB_1.PrivDB.getInstance();
            const room = await db.getRoom(roomId);
            if (!room) {
                logger_1.logger.warn('Room not found', { roomId });
                socket.emit('error', encryptForUser({ message: 'Room not found' }, publicKey));
                return;
            }
            if (room.hasPassword() && !room.validatePassword(password || '')) {
                logger_1.logger.warn('Invalid room password', { roomId });
                socket.emit('error', encryptForUser({ message: 'Invalid password' }, publicKey));
                return;
            }
            if (room.maxMembers > 0 && room.getMemberCount() >= room.maxMembers) {
                logger_1.logger.warn('Room is full', { roomId });
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
            const roomUsers = rooms.get(roomId);
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
                status: 'online',
            });
            // Send room info back to user
            const roomInfo = {
                roomId: room.id,
                userId: socket.id,
                name: room.name,
                description: room.description,
                max: room.maxMembers === 0 ? '∞' : room.maxMembers, //WHY THE FUCK IT ISNT BEING SENT TO THE FRONT END?????
                encryptedRoomKey: room.encryptedRoomKey,
                members: Array.from(roomUsers.values()).map(u => ({
                    username: u.username,
                    userId: u.socketId,
                    status: u.status
                }))
            };
            console.log(room);
            socket.emit('room-joined', encryptForUser(roomInfo, publicKey));
            logger_1.logger.info('User joined room successfully', { roomId, userId: socket.id });
        }
        catch (error) {
            logger_1.logger.error('Error joining room:', error);
            socket.emit('error', encryptForUser({ message: 'Failed to join room' }, publicKey));
        }
    });
    socket.on('leave-room', async ({ roomId, userId }) => {
        try {
            if (!roomId) {
                logger_1.logger.warn('No room ID provided for leave-room event');
                return;
            }
            const roomUsers = rooms.get(roomId);
            if (!roomUsers) {
                logger_1.logger.warn('Room not found for leave-room event', { roomId });
                return;
            }
            // Find the user in the room
            let leavingUser;
            let userId;
            for (const [id, user] of roomUsers.entries()) {
                if (user.socketId === socket.id) {
                    leavingUser = user;
                    userId = id;
                    break;
                }
            }
            if (!leavingUser || !userId) {
                logger_1.logger.warn('User not found in room', { roomId, socketId: socket.id });
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
            io.to(roomId).emit('user-left', notification);
            logger_1.logger.info(`User ${userId} left room ${roomId}`);
            // If room is empty, delete it from both memory and database
            if (roomUsers.size === 0) {
                rooms.delete(roomId);
                const db = await PrivDB_1.PrivDB.getInstance();
                await db.deleteRoom(roomId);
                logger_1.logger.info(`Room ${roomId} deleted - no more users`);
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling leave-room event:', error);
        }
    });
    socket.on('message', async ({ roomId, content, senderId }) => {
        try {
            if (!socket.data.roomId) {
                logger_1.logger.warn('User not in room or room not specified');
                return;
            }
            const roomUsers = rooms.get(socket.data.roomId);
            if (!roomUsers) {
                logger_1.logger.warn('Room not found', { roomId: socket.data.roomId });
                return;
            }
            const sender = roomUsers.get(socket.id);
            if (!sender) {
                logger_1.logger.warn('Sender not found in room', { roomId: socket.data.roomId, senderId: socket.id });
                return;
            }
            // Broadcast message to all users in room
            const messageData = {
                content,
                sender: sender.username,
                senderId: socket.id,
                timestamp: Date.now()
            };
            // Send to all users in room
            for (const user of roomUsers.values()) {
                const encryptedMessage = encryptForUser(messageData, user.publicKey);
                io.to(user.socketId).emit('message', encryptedMessage);
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing message:', error);
            socket.emit('messageError', { message: 'Failed to send message' });
        }
    });
    socket.on('disconnect', async () => {
        try {
            logger_1.logger.info('Client disconnected', { socketId: socket.id });
            // Find and leave any rooms the user was in
            for (const [roomId, roomUsers] of rooms.entries()) {
                let disconnectedUser;
                let userId;
                for (const [id, user] of roomUsers.entries()) {
                    if (user.socketId === socket.id) {
                        disconnectedUser = user;
                        userId = id;
                        break;
                    }
                }
                if (disconnectedUser && userId) {
                    // Skip if user already left the room properly
                    if (!socket.data.roomId)
                        continue;
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
                    io.to(roomId).emit('user-left', notification);
                    logger_1.logger.info(`User ${userId} disconnected from room ${roomId}`);
                    // If room is empty, delete it from both memory and database
                    if (roomUsers.size === 0) {
                        rooms.delete(roomId);
                        const db = await PrivDB_1.PrivDB.getInstance();
                        await db.deleteRoom(roomId);
                        logger_1.logger.info(`Room ${roomId} deleted - no more users`);
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling disconnect:', error);
        }
    });
});
const port = process.env.PORT || 3000;
server.listen(port, () => {
    const protocol = server instanceof https_1.default.Server ? 'HTTPS' : 'HTTP';
    logger_1.logger.info(`Server running on ${protocol} port ${port}`);
});
