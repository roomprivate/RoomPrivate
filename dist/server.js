"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = __importDefault(require("ws"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
const uuid_1 = require("uuid");
const accessLogger_1 = require("./middleware/accessLogger");
const Room_1 = require("./entities/Room");
const e2eEncryption_1 = require("./utils/e2eEncryption");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express_1.default.json());
app.use(accessLogger_1.accessLoggerMiddleware);
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
// Track rooms and their members
const rooms = new Map();
// Log active rooms every minute
setInterval(() => {
    logger_1.logger.info('Active rooms:', {
        count: rooms.size,
        rooms: Array.from(rooms.entries()).map(([id, room]) => ({
            id,
            name: room.name,
            memberCount: room.getMemberCount()
        }))
    });
}, 60000);
// WebSocket setup
const wss = new ws_1.default.Server({ server });
// Track clients and their rooms
const clients = new Map();
wss.on('connection', (ws) => {
    const socketId = (0, uuid_1.v4)();
    clients.set(socketId, ws);
    // Send connection confirmation
    ws.send(JSON.stringify({
        event: 'connected',
        data: { socketId }
    }));
    // Handle messages from clients
    ws.on('message', (message) => {
        try {
            const { event, data } = JSON.parse(message.toString());
            logger_1.logger.info('Received message:', { event, data });
            if (event === 'create-room') {
                try {
                    const { username, roomName, description, maxMembers, password } = data;
                    const keyPair = e2eEncryption_1.E2EEncryption.generateRoomKeyPair();
                    const room = new Room_1.Room((0, uuid_1.v4)(), roomName || username + "'s Room", keyPair, description, maxMembers, password);
                    // Add creator as first member
                    const memberKeyPair = e2eEncryption_1.E2EEncryption.generateRoomKeyPair();
                    room.addMember(socketId, username, memberKeyPair.publicKey);
                    rooms.set(room.id, room);
                    logger_1.logger.info('Room created:', {
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
                }
                catch (error) {
                    logger_1.logger.error('Error creating room:', error);
                    ws.send(JSON.stringify({
                        event: 'error',
                        data: { message: 'Failed to create room' }
                    }));
                }
            }
            if (event === 'join-room') {
                const { roomId, username } = data;
                logger_1.logger.info('Join room attempt:', { roomId, username, socketId });
                const room = rooms.get(roomId);
                logger_1.logger.info('Found room:', {
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
                    const memberKeyPair = e2eEncryption_1.E2EEncryption.generateRoomKeyPair();
                    room.addMember(socketId, username, memberKeyPair.publicKey);
                    logger_1.logger.info('Member joined room:', {
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
                    room.members.forEach((member) => {
                        if (member.userId !== socketId) {
                            const client = clients.get(member.userId);
                            if (client && client.readyState === ws_1.default.OPEN) {
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
                }
                else {
                    logger_1.logger.warn('Room not found:', { roomId });
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
                    logger_1.logger.warn('Message sent to non-existent room:', { roomId });
                    ws.send(JSON.stringify({
                        event: 'error',
                        data: { message: 'Room not found' }
                    }));
                    return;
                }
                if (!room.isMember(socketId)) {
                    logger_1.logger.warn('Message sent by non-member:', { roomId, socketId });
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
                logger_1.logger.info('Broadcasting encrypted message:', {
                    roomId,
                    recipientCount: room.getMemberCount() - 1
                });
                // Send to all members in the room except sender
                room.members.forEach((member) => {
                    if (member.userId !== socketId) {
                        const client = clients.get(member.userId);
                        if (client && client.readyState === ws_1.default.OPEN) {
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
                logger_1.logger.info('Client disconnected', { socketId });
                // Remove from all rooms and notify other members
                rooms.forEach((room, roomId) => {
                    const member = room.members.find(m => m.userId === socketId);
                    if (member) {
                        // Remove member from room
                        room.members = room.members.filter(m => m.userId !== socketId);
                        // Notify remaining members
                        room.members.forEach((m) => {
                            const client = clients.get(m.userId);
                            if (client && client.readyState === ws_1.default.OPEN) {
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
        }
        catch (error) {
            logger_1.logger.error('Error handling message:', error);
            ws.send(JSON.stringify({
                event: 'error',
                data: { message: 'Failed to process message' }
            }));
        }
    });
});
// Handle process termination
process.on('SIGINT', () => {
    logger_1.logger.info('Received SIGINT. Cleaning up...');
    cleanup();
});
process.on('SIGTERM', () => {
    logger_1.logger.info('Received SIGTERM. Cleaning up...');
    cleanup();
});
// Cleanup function
function cleanup() {
    logger_1.logger.info('Starting cleanup process...');
    // Close WebSocket server
    wss.close(() => {
        logger_1.logger.info('WebSocket server closed');
    });
    // Close HTTP/HTTPS server
    server.close(() => {
        logger_1.logger.info('HTTP/HTTPS server closed');
        // Exit the process after a short delay to allow logs to be written
        setTimeout(() => {
            process.exit(0);
        }, 100);
    });
}
const port = process.env.PORT || 3000;
server.listen(port, () => {
    const protocol = server instanceof https_1.default.Server ? 'HTTPS' : 'HTTP';
    logger_1.logger.info(`Server running on ${protocol} port ${port}`);
});
