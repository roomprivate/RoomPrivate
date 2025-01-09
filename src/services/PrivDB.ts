import { PrismaClient } from '@prisma/client';
import { Room, RoomMember } from '../entities/Room';
import * as CryptoJS from 'crypto-js';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { generateRoomName } from '../utils/wordLists';

export class PrivDB {
    private static instance: PrivDB;
    private prisma: PrismaClient;

    private constructor() {
        this.prisma = new PrismaClient();
    }

    static async getInstance(): Promise<PrivDB> {
        if (!PrivDB.instance) {
            PrivDB.instance = new PrivDB();
        }
        return PrivDB.instance;
    }

    async createRoom(data: {
        name?: string,
        description?: string,
        maxMembers?: number,
        password?: string
    }): Promise<Room> {
        try {
            const id = uuidv4();
            const encryptedPassword = data.password ? 
                CryptoJS.SHA256(data.password).toString() : 
                undefined;

            const roomKey = CryptoJS.lib.WordArray.random(32).toString();
            const roomName = data.name || generateRoomName();

            const room = new Room(
                id,
                roomName,
                roomKey,
                data.description,
                data.maxMembers || 0,
                encryptedPassword
            );

            await this.prisma.room.create({
                data: this.serializeRoom(room)
            });

            return room;
        } catch (error) {
            logger.error('Error creating room:', error);
            throw error;
        }
    }

    private serializeRoom(room: Room): any {
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
        } catch (error) {
            logger.error('Error serializing room:', error);
            throw error;
        }
    }

    private deserializeRoom(dbRoom: any): Room {
        if (!dbRoom) {
            throw new Error('Cannot deserialize null room data');
        }
        try {
            const room = new Room(
                dbRoom.id,
                dbRoom.name,
                dbRoom.encryptedRoomKey,
                dbRoom.description,
                dbRoom.maxMembers,
                dbRoom.encryptedPassword
            );
            room.members = JSON.parse(dbRoom.members || '{}') as { [userId: string]: RoomMember };
            return room;
        } catch (error) {
            logger.error('Error deserializing room:', { roomId: dbRoom?.id, error });
            throw error;
        }
    }

    async getRoom(id: string): Promise<Room | null> {
        try {
            const dbRoom = await this.prisma.room.findUnique({
                where: { id }
            });

            if (!dbRoom) {
                return null;
            }

            return this.deserializeRoom(dbRoom);
        } catch (error) {
            logger.error('Error getting room:', error);
            throw error;
        }
    }

    async updateRoom(room: Room): Promise<void> {
        try {
            await this.prisma.room.update({
                where: { id: room.id },
                data: this.serializeRoom(room)
            });
        } catch (error) {
            logger.error('Error updating room:', error);
            throw error;
        }
    }

    async deleteRoom(id: string): Promise<void> {
        try {
            await this.prisma.room.delete({
                where: { id }
            });
        } catch (error) {
            logger.error('Error deleting room:', error);
            throw error;
        }
    }
}
