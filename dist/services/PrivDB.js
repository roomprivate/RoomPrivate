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
const typeorm_1 = require("typeorm");
const Room_1 = require("../entities/Room");
const CryptoJS = __importStar(require("crypto-js"));
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
class PrivDB {
    constructor() {
        // Generate a strong encryption key from environment or create a new one
        this.encryptionKey = process.env.DB_ENCRYPTION_KEY || CryptoJS.lib.WordArray.random(256 / 8).toString();
        // Use a unique prefix for this server instance
        this.ivPrefix = (0, uuid_1.v4)();
        this.dataSource = new typeorm_1.DataSource({
            type: 'better-sqlite3',
            database: 'rooms.db',
            entities: [Room_1.Room],
            synchronize: true,
            logging: false
        });
    }
    static async getInstance() {
        if (!PrivDB.instance) {
            PrivDB.instance = new PrivDB();
            await PrivDB.instance.dataSource.initialize();
        }
        return PrivDB.instance;
    }
    generateIV(id) {
        // Generate a deterministic IV for each record using the server prefix
        return CryptoJS.SHA256(this.ivPrefix + id).toString().substring(0, 32);
    }
    encryptField(value, id) {
        if (value === null || value === undefined)
            return '';
        const iv = this.generateIV(id);
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        // Use AES-256-CBC with PKCS7 padding
        const encrypted = CryptoJS.AES.encrypt(valueStr, this.encryptionKey, {
            iv: CryptoJS.enc.Hex.parse(iv),
            padding: CryptoJS.pad.Pkcs7,
            mode: CryptoJS.mode.CBC
        });
        return encrypted.toString();
    }
    decryptField(encrypted, id) {
        if (!encrypted)
            return null;
        try {
            const iv = this.generateIV(id);
            const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptionKey, {
                iv: CryptoJS.enc.Hex.parse(iv),
                padding: CryptoJS.pad.Pkcs7,
                mode: CryptoJS.mode.CBC
            });
            const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
            try {
                return JSON.parse(decryptedStr);
            }
            catch {
                return decryptedStr;
            }
        }
        catch (error) {
            logger_1.logger.error('Decryption failed:', error);
            return null;
        }
    }
    encryptRoom(room) {
        const encryptedRoom = new Room_1.Room(room.id, this.encryptField(room.name, room.id) || '', room.ownerId, room.encryptedRoomKey, this.encryptField(room.description, room.id) || '', room.maxMembers, room.encryptedPassword || undefined);
        // Encrypt members and roles
        encryptedRoom.members = JSON.parse(this.encryptField(room.members, room.id + '_members') || '{}');
        encryptedRoom.roles = JSON.parse(this.encryptField(room.roles, room.id + '_roles') || '[]');
        return encryptedRoom;
    }
    decryptRoom(room) {
        if (!room)
            return room;
        // First decrypt all fields
        const decryptedName = this.decryptField(room.name, room.id) || '';
        const decryptedDesc = room.description ? this.decryptField(room.description, room.id) : undefined;
        const decryptedMembers = this.decryptField(JSON.stringify(room.members), room.id + '_members') || '{}';
        const decryptedRoles = this.decryptField(JSON.stringify(room.roles), room.id + '_roles') || '[]';
        // Create new room with decrypted values
        const decryptedRoom = new Room_1.Room(room.id, decryptedName, room.ownerId, room.encryptedRoomKey, decryptedDesc, room.maxMembers, room.encryptedPassword);
        // Set complex objects after parsing
        decryptedRoom.members = JSON.parse(decryptedMembers);
        decryptedRoom.roles = JSON.parse(decryptedRoles);
        return decryptedRoom;
    }
    async createRoom(hasPassword, password, description, maxMembers = 0, ownerIp = '', ownerUsername = '', ownerPersistentKey) {
        try {
            const room = Room_1.Room.createRoom(hasPassword, hasPassword && password ? password : '', description, maxMembers, ownerIp, ownerUsername, ownerPersistentKey);
            const encryptedRoom = this.encryptRoom(room);
            const savedRoom = await this.dataSource.getRepository(Room_1.Room).save(encryptedRoom);
            logger_1.logger.info('Room created in database', {
                roomId: savedRoom.id,
                roomName: savedRoom.name,
                hasPassword: hasPassword,
                maxMembers: maxMembers
            });
            return this.decryptRoom(savedRoom);
        }
        catch (error) {
            logger_1.logger.error('Failed to create room', {
                error: error instanceof Error ? error.message : 'Unknown error',
                hasPassword,
                maxMembers
            });
            return null;
        }
    }
    async validateRoom(roomId, password) {
        try {
            const room = await this.dataSource.getRepository(Room_1.Room).findOne({ where: { id: roomId } });
            if (!room) {
                logger_1.logger.warn('Room not found during validation', { roomId });
                return { valid: false };
            }
            const decryptedRoom = this.decryptRoom(room);
            if (password) {
                const isValid = decryptedRoom.validatePassword(password);
                logger_1.logger.info('Room password validation', {
                    roomId,
                    valid: isValid
                });
                return { valid: isValid, room: isValid ? decryptedRoom : undefined };
            }
            logger_1.logger.info('Room validated successfully', { roomId });
            return { valid: true, room: decryptedRoom };
        }
        catch (error) {
            logger_1.logger.error('Error validating room', {
                roomId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async getRoom(id) {
        const repository = this.dataSource.getRepository(Room_1.Room);
        const room = await repository.findOne({ where: { id } });
        return room ? this.decryptRoom(room) : null;
    }
    async updateRoom(room) {
        const repository = this.dataSource.getRepository(Room_1.Room);
        await repository.save(this.encryptRoom(room));
    }
    async deleteRoom(id) {
        const repository = this.dataSource.getRepository(Room_1.Room);
        await repository.delete(id);
    }
    async getRooms() {
        const repository = this.dataSource.getRepository(Room_1.Room);
        const rooms = await repository.find();
        return rooms.map(room => this.decryptRoom(room));
    }
}
exports.PrivDB = PrivDB;
