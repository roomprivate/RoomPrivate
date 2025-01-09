"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivDB = void 0;
const client_1 = require("@prisma/client");
const Room_1 = require("../entities/Room");
const logger_1 = require("../utils/logger");
const wordLists_1 = require("../utils/wordLists");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const encryptionBinary_1 = require("../utils/encryptionBinary");
class PrivDB {
    constructor() {
        this.encryptionProcess = null;
        this.prisma = new client_1.PrismaClient();
        this.startEncryptionProcess();
    }
    startEncryptionProcess() {
        const isWindows = os_1.default.platform() === 'win32';
        const binaryName = isWindows ? 'encryption.exe' : 'encryption';
        const executablePath = path_1.default.join(process.cwd(), 'encryption', 'target', 'release', binaryName);
        this.encryptionProcess = (0, child_process_1.spawn)(executablePath, [], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        this.encryptionProcess.stderr?.on('data', (data) => {
            logger_1.logger.error('Encryption process error:', data.toString());
        });
        this.encryptionProcess.on('error', (error) => {
            logger_1.logger.error('Failed to start encryption process:', error);
            this.encryptionProcess = null;
        });
        this.encryptionProcess.on('exit', (code) => {
            logger_1.logger.error(`Encryption process exited with code ${code}`);
            this.encryptionProcess = null;
        });
    }
    async sendToRustProcess(request) {
        if (!this.encryptionProcess || !this.encryptionProcess.stdin || !this.encryptionProcess.stdout) {
            this.startEncryptionProcess();
            if (!this.encryptionProcess || !this.encryptionProcess.stdin || !this.encryptionProcess.stdout) {
                throw new Error('Failed to start encryption process');
            }
        }
        return new Promise((resolve, reject) => {
            const responseHandler = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response);
                }
                catch (error) {
                    reject(error);
                }
            };
            this.encryptionProcess.stdout.once('data', responseHandler);
            try {
                this.encryptionProcess.stdin.write(JSON.stringify(request) + '\n');
            }
            catch (error) {
                this.encryptionProcess.stdout.removeListener('data', responseHandler);
                reject(error);
            }
        });
    }
    static async getInstance() {
        if (!PrivDB.instance) {
            PrivDB.instance = new PrivDB();
        }
        return PrivDB.instance;
    }
    async createRoom(data) {
        try {
            // Generate UUID using Rust service
            const idResponse = await this.sendToRustProcess({
                type: 'generate_uuid'
            });
            const id = idResponse.uuid;
            // Hash password using Rust service if provided
            let encryptedPassword;
            if (data.password) {
                const hashResponse = await this.hashPassword(data.password);
                encryptedPassword = hashResponse;
            }
            // Generate room key using Rust service
            const roomKey = await this.generateRoomKey();
            const roomName = data.name || (0, wordLists_1.generateRoomName)();
            const room = new Room_1.Room(id, roomName, roomKey, data.description, data.maxMembers || 0, encryptedPassword);
            await this.prisma.room.create({
                data: this.serializeRoom(room)
            });
            return room;
        }
        catch (error) {
            logger_1.logger.error('Error creating room:', error);
            throw error;
        }
    }
    serializeRoom(room) {
        if (!room) {
            throw new Error('Cannot serialize null room');
        }
        try {
            return {
                id: room.id,
                name: room.name,
                description: room.description,
                encryptedPassword: room.encryptedPassword,
                members: JSON.stringify(room.members || {}),
                encryptedRoomKey: room.encryptedRoomKey,
                maxMembers: room.maxMembers
            };
        }
        catch (error) {
            logger_1.logger.error('Error serializing room:', error);
            throw error;
        }
    }
    deserializeRoom(dbRoom) {
        if (!dbRoom) {
            throw new Error('Cannot deserialize null room data');
        }
        try {
            const room = new Room_1.Room(dbRoom.id, dbRoom.name, dbRoom.encryptedRoomKey, dbRoom.description, dbRoom.maxMembers, dbRoom.encryptedPassword);
            room.members = JSON.parse(dbRoom.members || '{}');
            return room;
        }
        catch (error) {
            logger_1.logger.error('Error deserializing room:', { roomId: dbRoom?.id, error });
            throw error;
        }
    }
    async getRoom(id) {
        try {
            const dbRoom = await this.prisma.room.findUnique({
                where: { id }
            });
            if (!dbRoom) {
                return null;
            }
            return this.deserializeRoom(dbRoom);
        }
        catch (error) {
            logger_1.logger.error('Error getting room:', error);
            throw error;
        }
    }
    async updateRoom(room) {
        try {
            await this.prisma.room.update({
                where: { id: room.id },
                data: this.serializeRoom(room)
            });
        }
        catch (error) {
            logger_1.logger.error('Error updating room:', error);
            throw error;
        }
    }
    async deleteRoom(id) {
        try {
            await this.prisma.room.delete({
                where: { id }
            });
        }
        catch (error) {
            logger_1.logger.error('Error deleting room:', error);
            throw error;
        }
    }
    async generateRoomKey() {
        try {
            const response = await encryptionBinary_1.encryptionBinary.sendCommand({
                type: 'generate_room_key'
            });
            return response.key;
        }
        catch (error) {
            throw new Error(`Failed to generate room key: ${error}`);
        }
    }
    async hashPassword(password) {
        try {
            const response = await encryptionBinary_1.encryptionBinary.sendCommand({
                type: 'hash_password',
                password
            });
            return response.hash;
        }
        catch (error) {
            throw new Error(`Failed to hash password: ${error}`);
        }
    }
}
exports.PrivDB = PrivDB;
