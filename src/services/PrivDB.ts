import { PrismaClient } from '@prisma/client';
import { Room } from '../entities/Room';
import * as CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { RoomMember, Role } from '../entities/Room';

export class PrivDB {
    private static instance: PrivDB;
    private prisma: PrismaClient;
    private readonly encryptionKey: string;
    private readonly ivPrefix: string;

    private constructor() {
        if (!process.env.DB_ENCRYPTION_KEY) {
            throw new Error('DB_ENCRYPTION_KEY environment variable is not set');
        }
        this.encryptionKey = process.env.DB_ENCRYPTION_KEY;
        this.ivPrefix = uuidv4();
        this.prisma = new PrismaClient();
        logger.info('PrivDB initialized with encryption key');
    }

    static async getInstance(): Promise<PrivDB> {
        if (!PrivDB.instance) {
            PrivDB.instance = new PrivDB();
        }
        return PrivDB.instance;
    }

    generateIV(id: string): string {
        return CryptoJS.SHA256(this.ivPrefix + id).toString().slice(0, 32);
    }

    encryptField(value: any, id: string): string {
        if (!this.encryptionKey) {
            throw new Error('No encryption key registered');
        }
        const iv = this.generateIV(id);
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        return CryptoJS.AES.encrypt(valueStr, this.encryptionKey, {
            iv: CryptoJS.enc.Hex.parse(iv)
        }).toString();
    }

    decryptField(encrypted: string, id: string): any {
        if (!this.encryptionKey) {
            throw new Error('No encryption key registered');
        }
        const iv = this.generateIV(id);
        const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptionKey, {
            iv: CryptoJS.enc.Hex.parse(iv)
        }).toString(CryptoJS.enc.Utf8);
        try {
            return JSON.parse(decrypted);
        } catch {
            return decrypted;
        }
    }

    serializeRoom(room: Room): any {
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
        } catch (error) {
            logger.error('Error serializing room:', error);
            throw error;
        }
    }

    deserializeRoom(dbRoom: any): Room {
        if (!dbRoom) {
            throw new Error('Cannot deserialize null room data');
        }
        try {
            const room = new Room(
                dbRoom.id,
                dbRoom.name,
                dbRoom.ownerId,
                dbRoom.encryptedRoomKey,
                dbRoom.description,
                dbRoom.maxMembers,
                dbRoom.encryptedPassword
            );
            room.members = JSON.parse(dbRoom.members || '{}') as { [userId: string]: RoomMember };
            room.roles = JSON.parse(dbRoom.roles || '[]') as Role[];
            return room;
        } catch (error) {
            logger.error('Error deserializing room:', { roomId: dbRoom?.id, error });
            throw error;
        }
    }

    async createRoom(
        hasPassword: boolean,
        password: string | undefined,
        description?: string,
        maxMembers: number = 0,
        ownerIp: string = '',
        ownerUsername: string = '',
        ownerPersistentKey?: string
    ): Promise<Room | null> {
        try {
            const room = await Room.createRoom(
                hasPassword,
                hasPassword && password ? password : '',
                description,
                maxMembers,
                ownerIp,
                ownerUsername,
                ownerPersistentKey
            );

            const serializedRoom = this.serializeRoom(room);
            const savedRoom = await this.prisma.room.create({
                data: serializedRoom
            });

            logger.info('Room created in database', {
                roomId: savedRoom.id,
                roomName: savedRoom.name,
                hasPassword: hasPassword,
                maxMembers: maxMembers
            });

            return this.deserializeRoom(savedRoom);
        } catch (error) {
            logger.error('Error creating room:', error);
            return null;
        }
    }

    async validateRoom(roomId: string, password?: string): Promise<{ valid: boolean; room?: Room }> {
        try {
            const room = await this.getRoom(roomId);
            if (!room) {
                logger.warn('Room not found during validation', { roomId });
                return { valid: false };
            }

            if (room.hasPassword() && !room.validatePassword(password || '')) {
                logger.warn('Invalid password for room', { roomId });
                return { valid: false };
            }

            return { valid: true, room };
        } catch (error) {
            logger.error('Error validating room:', { roomId, error });
            return { valid: false };
        }
    }

    async getRoom(id: string): Promise<Room | null> {
        try {
            const room = await this.prisma.room.findUnique({
                where: { id }
            });
            return room ? this.deserializeRoom(room) : null;
        } catch (error) {
            logger.error('Error getting room:', { id, error });
            return null;
        }
    }

    async updateRoom(room: Room): Promise<void> {
        try {
            const serializedRoom = this.serializeRoom(room);
            await this.prisma.room.update({
                where: { id: room.id },
                data: serializedRoom
            });
            logger.info('Room updated successfully', { roomId: room.id });
        } catch (error) {
            logger.error('Error updating room:', { roomId: room.id, error });
            throw error;
        }
    }

    async deleteRoom(id: string): Promise<void> {
        try {
            await this.prisma.room.delete({
                where: { id }
            });
            logger.info('Room deleted successfully', { roomId: id });
        } catch (error) {
            logger.error('Error deleting room:', { roomId: id, error });
            throw error;
        }
    }

    async getRooms(): Promise<Room[]> {
        try {
            const rooms = await this.prisma.room.findMany();
            return rooms.map(room => this.deserializeRoom(room));
        } catch (error) {
            logger.error('Error getting rooms:', error);
            return [];
        }
    }
}
