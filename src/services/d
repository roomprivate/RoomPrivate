import { PrismaClient } from '@prisma/client';
import { Room, RoomMember } from '../entities/Room';
import { logger } from '../utils/logger';
import { generateRoomName } from '../utils/wordLists';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { encryptionBinary } from '../utils/encryptionBinary';

export class PrivDB {
    private static instance: PrivDB;
    private prisma: PrismaClient;
    private encryptionProcess: ReturnType<typeof spawn> | null = null;

    private constructor() {
        this.prisma = new PrismaClient();
        this.startEncryptionProcess();
    }

    private startEncryptionProcess() {
        const isWindows = os.platform() === 'win32';
        const binaryName = isWindows ? 'encryption.exe' : 'encryption';
        const executablePath = path.join(process.cwd(), 'encryption', 'target', 'release', binaryName);
        
        this.encryptionProcess = spawn(executablePath, [], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.encryptionProcess.stderr?.on('data', (data) => {
            logger.error('Encryption process error:', data.toString());
        });

        this.encryptionProcess.on('error', (error) => {
            logger.error('Failed to start encryption process:', error);
            this.encryptionProcess = null;
        });

        this.encryptionProcess.on('exit', (code) => {
            logger.error(`Encryption process exited with code ${code}`);
            this.encryptionProcess = null;
        });
    }

    private async sendToRustProcess(request: any): Promise<any> {
        if (!this.encryptionProcess || !this.encryptionProcess.stdin || !this.encryptionProcess.stdout) {
            this.startEncryptionProcess();
            if (!this.encryptionProcess || !this.encryptionProcess.stdin || !this.encryptionProcess.stdout) {
                throw new Error('Failed to start encryption process');
            }
        }

        return new Promise((resolve, reject) => {
            const responseHandler = (data: Buffer) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            };

            this.encryptionProcess!.stdout!.once('data', responseHandler);

            try {
                this.encryptionProcess!.stdin!.write(JSON.stringify(request) + '\n');
            } catch (error) {
                this.encryptionProcess!.stdout!.removeListener('data', responseHandler);
                reject(error);
            }
        });
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
            // Generate UUID using Rust service
            const idResponse = await this.sendToRustProcess({
                type: 'generate_uuid'
            });
            const id = idResponse.uuid;

            // Hash password using Rust service if provided
            let encryptedPassword: string | undefined;
            if (data.password) {
                const hashResponse = await this.hashPassword(data.password);
                encryptedPassword = hashResponse;
            }

            // Generate room key using Rust service
            const roomKey = await this.generateRoomKey();
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

    async generateRoomKey(): Promise<string> {
        try {
            const response = await encryptionBinary.sendCommand({
                type: 'generate_room_key'
            });
            return response.key;
        } catch (error) {
            throw new Error(`Failed to generate room key: ${error}`);
        }
    }

    async hashPassword(password: string): Promise<string> {
        try {
            const response = await encryptionBinary.sendCommand({
                type: 'hash_password',
                password
            });
            return response.hash;
        } catch (error) {
            throw new Error(`Failed to hash password: ${error}`);
        }
    }
}
