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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivDB = void 0;
const client_1 = require("@prisma/client");
const Room_1 = require("../entities/Room");
const CryptoJS = __importStar(require("crypto-js"));
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
class PrivDB {
    constructor() {
        if (!process.env.DB_ENCRYPTION_KEY) {
            throw new Error('DB_ENCRYPTION_KEY environment variable is not set');
        }
        this.encryptionKey = process.env.DB_ENCRYPTION_KEY;
        this.ivPrefix = (0, uuid_1.v4)();
        this.prisma = new client_1.PrismaClient();
        logger_1.logger.info('PrivDB initialized with encryption key');
    }
    static async getInstance() {
        if (!PrivDB.instance) {
            PrivDB.instance = new PrivDB();
        }
        return PrivDB.instance;
    }
    generateIV(id) {
        return CryptoJS.SHA256(this.ivPrefix + id).toString().slice(0, 32);
    }
    encryptField(value, id) {
        if (!this.encryptionKey) {
            throw new Error('No encryption key registered');
        }
        const iv = this.generateIV(id);
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        return CryptoJS.AES.encrypt(valueStr, this.encryptionKey, {
            iv: CryptoJS.enc.Hex.parse(iv)
        }).toString();
    }
    decryptField(encrypted, id) {
        if (!this.encryptionKey) {
            throw new Error('No encryption key registered');
        }
        const iv = this.generateIV(id);
        const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptionKey, {
            iv: CryptoJS.enc.Hex.parse(iv)
        }).toString(CryptoJS.enc.Utf8);
        try {
            return JSON.parse(decrypted);
        }
        catch {
            return decrypted;
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
                ownerId: room.ownerId,
                members: JSON.stringify(room.members || {}),
                roles: JSON.stringify(room.roles || []),
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
            const room = new Room_1.Room(dbRoom.id, dbRoom.name, dbRoom.ownerId, dbRoom.encryptedRoomKey, dbRoom.description, dbRoom.maxMembers, dbRoom.encryptedPassword);
            room.members = JSON.parse(dbRoom.members || '{}');
            room.roles = JSON.parse(dbRoom.roles || '[]');
            return room;
        }
        catch (error) {
            logger_1.logger.error('Error deserializing room:', { roomId: dbRoom?.id, error });
            throw error;
        }
    }
    async createRoom(hasPassword, password, description, maxMembers = 0, ownerIp = '', ownerUsername = '', ownerPersistentKey) {
        try {
            const room = await Room_1.Room.createRoom(hasPassword, hasPassword && password ? password : '', description, maxMembers, ownerIp, ownerUsername, ownerPersistentKey);
            const serializedRoom = this.serializeRoom(room);
            const savedRoom = await this.prisma.room.create({
                data: serializedRoom
            });
            logger_1.logger.info('Room created in database', {
                roomId: savedRoom.id,
                roomName: savedRoom.name,
                hasPassword: hasPassword,
                maxMembers: maxMembers
            });
            return this.deserializeRoom(savedRoom);
        }
        catch (error) {
            logger_1.logger.error('Error creating room:', error);
            return null;
        }
    }
    async validateRoom(roomId, password) {
        try {
            const room = await this.getRoom(roomId);
            if (!room) {
                logger_1.logger.warn('Room not found during validation', { roomId });
                return { valid: false };
            }
            if (room.hasPassword() && !room.validatePassword(password || '')) {
                logger_1.logger.warn('Invalid password for room', { roomId });
                return { valid: false };
            }
            return { valid: true, room };
        }
        catch (error) {
            logger_1.logger.error('Error validating room:', { roomId, error });
            return { valid: false };
        }
    }
    async getRoom(id) {
        try {
            const room = await this.prisma.room.findUnique({
                where: { id }
            });
            return room ? this.deserializeRoom(room) : null;
        }
        catch (error) {
            logger_1.logger.error('Error getting room:', { id, error });
            return null;
        }
    }
    async updateRoom(room) {
        try {
            const serializedRoom = this.serializeRoom(room);
            await this.prisma.room.update({
                where: { id: room.id },
                data: serializedRoom
            });
            logger_1.logger.info('Room updated successfully', { roomId: room.id });
        }
        catch (error) {
            logger_1.logger.error('Error updating room:', { roomId: room.id, error });
            throw error;
        }
    }
    async deleteRoom(id) {
        try {
            await this.prisma.room.delete({
                where: { id }
            });
            logger_1.logger.info('Room deleted successfully', { roomId: id });
        }
        catch (error) {
            logger_1.logger.error('Error deleting room:', { roomId: id, error });
            throw error;
        }
    }
    async getRooms() {
        try {
            const rooms = await this.prisma.room.findMany();
            return rooms.map(room => this.deserializeRoom(room));
        }
        catch (error) {
            logger_1.logger.error('Error getting rooms:', error);
            return [];
        }
    }
}
exports.PrivDB = PrivDB;
