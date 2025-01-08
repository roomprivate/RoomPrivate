import { DataSource } from 'typeorm';
import { Room } from '../entities/Room';
import * as CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export class PrivDB {
    private static instance: PrivDB;
    private dataSource: DataSource;
    private readonly encryptionKey: string;
    private readonly ivPrefix: string;

    private constructor() {
        // Generate a strong encryption key from environment or create a new one
        this.encryptionKey = process.env.DB_ENCRYPTION_KEY || CryptoJS.lib.WordArray.random(256/8).toString();
        // Use a unique prefix for this server instance
        this.ivPrefix = uuidv4();
        
        this.dataSource = new DataSource({
            type: 'better-sqlite3',
            database: 'rooms.db',
            entities: [Room],
            synchronize: true,
            logging: false
        });
    }

    static async getInstance(): Promise<PrivDB> {
        if (!PrivDB.instance) {
            PrivDB.instance = new PrivDB();
            await PrivDB.instance.dataSource.initialize();
        }
        return PrivDB.instance;
    }

    private generateIV(id: string): string {
        // Generate a deterministic IV for each record using the server prefix
        return CryptoJS.SHA256(this.ivPrefix + id).toString().substring(0, 32);
    }

    private encryptField(value: any, id: string): string {
        if (value === null || value === undefined) return '';
        
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

    private decryptField(encrypted: string, id: string): any {
        if (!encrypted) return null;
        
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
            } catch {
                return decryptedStr;
            }
        } catch (error) {
            logger.error('Decryption failed:', error);
            return null;
        }
    }

    private encryptRoom(room: Room): Room {
        const encryptedRoom = new Room(
            room.id,
            this.encryptField(room.name, room.id) || '',  
            room.ownerId,
            room.encryptedRoomKey,
            this.encryptField(room.description, room.id) || '',  
            room.maxMembers,
            room.encryptedPassword || undefined  
        );

        // Encrypt members and roles
        encryptedRoom.members = JSON.parse(this.encryptField(room.members, room.id + '_members') || '{}');
        encryptedRoom.roles = JSON.parse(this.encryptField(room.roles, room.id + '_roles') || '[]');

        return encryptedRoom;
    }

    private decryptRoom(room: Room): Room {
        if (!room) return room;

        // First decrypt all fields
        const decryptedName = this.decryptField(room.name, room.id) || '';
        const decryptedDesc = room.description ? this.decryptField(room.description, room.id) : undefined;
        const decryptedMembers = this.decryptField(JSON.stringify(room.members), room.id + '_members') || '{}';
        const decryptedRoles = this.decryptField(JSON.stringify(room.roles), room.id + '_roles') || '[]';

        // Create new room with decrypted values
        const decryptedRoom = new Room(
            room.id,
            decryptedName,
            room.ownerId,
            room.encryptedRoomKey,
            decryptedDesc,
            room.maxMembers,
            room.encryptedPassword
        );

        // Set complex objects after parsing
        decryptedRoom.members = JSON.parse(decryptedMembers);
        decryptedRoom.roles = JSON.parse(decryptedRoles);

        return decryptedRoom;
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
            const room = Room.createRoom(
                hasPassword,
                hasPassword && password ? password : '',  
                description,
                maxMembers,
                ownerIp,
                ownerUsername,
                ownerPersistentKey
            );

            const encryptedRoom = this.encryptRoom(room);
            const savedRoom = await this.dataSource.getRepository(Room).save(encryptedRoom);
            
            logger.info('Room created in database', { 
                roomId: savedRoom.id, 
                roomName: savedRoom.name,
                hasPassword: hasPassword,
                maxMembers: maxMembers
            });

            return this.decryptRoom(savedRoom);
        } catch (error) {
            logger.error('Failed to create room', {
                error: error instanceof Error ? error.message : 'Unknown error',
                hasPassword,
                maxMembers
            });
            return null;
        }
    }

    async validateRoom(roomId: string, password?: string): Promise<{ valid: boolean; room?: Room }> {
        try {
            const room = await this.dataSource.getRepository(Room).findOne({ where: { id: roomId } });
            
            if (!room) {
                logger.warn('Room not found during validation', { roomId });
                return { valid: false };
            }
            
            const decryptedRoom = this.decryptRoom(room);
            
            if (password) {
                const isValid = decryptedRoom.validatePassword(password);
                logger.info('Room password validation', { 
                    roomId, 
                    valid: isValid 
                });
                return { valid: isValid, room: isValid ? decryptedRoom : undefined };
            }
            
            logger.info('Room validated successfully', { roomId });
            return { valid: true, room: decryptedRoom };
        } catch (error) {
            logger.error('Error validating room', {
                roomId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    async getRoom(id: string): Promise<Room | null> {
        const repository = this.dataSource.getRepository(Room);
        const room = await repository.findOne({ where: { id } });
        return room ? this.decryptRoom(room) : null;
    }

    async updateRoom(room: Room): Promise<void> {
        const repository = this.dataSource.getRepository(Room);
        await repository.save(this.encryptRoom(room));
    }

    async deleteRoom(id: string): Promise<void> {
        const repository = this.dataSource.getRepository(Room);
        await repository.delete(id);
    }

    async getRooms(): Promise<Room[]> {
        const repository = this.dataSource.getRepository(Room);
        const rooms = await repository.find();
        return rooms.map(room => this.decryptRoom(room));
    }
}
