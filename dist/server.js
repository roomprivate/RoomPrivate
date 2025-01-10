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
const child_process_1 = require("child_process");
const Room_1 = require("./entities/Room");
const e2eEncryption_1 = require("./utils/e2eEncryption");
const os_1 = __importDefault(require("os"));
dotenv_1.default.config();
// Start the Rust binary server
const isWindows = os_1.default.platform() === 'win32';
const rustBinaryPath = path_1.default.join(__dirname, '../target/release', isWindows ? 'klee_socket.exe' : 'klee_socket');
if (!fs_1.default.existsSync(rustBinaryPath)) {
    logger_1.logger.error(`Rust binary not found at path: ${rustBinaryPath}`);
    process.exit(1);
}
const rustServer = (0, child_process_1.spawn)(rustBinaryPath);
rustServer.stdout.on('data', (data) => {
    logger_1.logger.info(`Rust server stdout: ${data}`);
});
rustServer.stderr.on('data', (data) => {
    logger_1.logger.error(`Rust server stderr: ${data}`);
});
rustServer.on('close', (code) => {
    logger_1.logger.error(`Rust server process exited with code ${code}`);
    process.exit(1);
});
// Clean up Rust server on process exit
process.on('exit', () => {
    rustServer.kill();
});
process.on('SIGINT', () => {
    rustServer.kill();
    process.exit();
});
process.on('SIGTERM', () => {
    rustServer.kill();
    process.exit();
});
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
<<<<<<< HEAD
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
=======
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
>>>>>>> eb524dfbcfa2e1b4df515370de90ee94be109a9c
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
                        room.removeMember(socketId);
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
