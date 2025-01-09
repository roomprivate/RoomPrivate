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
const logger_1 = require("../utils/logger");
const uuid_1 = require("uuid");
const wordLists_1 = require("../utils/wordLists");
class PrivDB {
    constructor() {
        this.prisma = new client_1.PrismaClient();
    }
    static async getInstance() {
        if (!PrivDB.instance) {
            PrivDB.instance = new PrivDB();
        }
        return PrivDB.instance;
    }
    async createRoom(data) {
        try {
            const id = (0, uuid_1.v4)();
            const encryptedPassword = data.password ?
                CryptoJS.SHA256(data.password).toString() :
                undefined;
            const roomKey = CryptoJS.lib.WordArray.random(32).toString();
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
}
exports.PrivDB = PrivDB;
