import { encryptionBinary } from '../utils/encryptionBinary';
import { generateRoomName } from '../utils/wordLists';
import * as CryptoJS from 'crypto-js';

export interface RoomMember {
    userId: string;
    username: string;
    publicKey?: string;
}

export interface EncryptedRoomKeys {
    [userId: string]: string;  // userId -> encrypted room private key
}

export enum Permission {
    CHAT = "CHAT",
    VIEW = "VIEW",
    KICK = "KICK",
    BAN = "BAN",
    MANAGE_ROLES = "MANAGE_ROLES",
    MANAGE_MESSAGES = "MANAGE_MESSAGES",
    ALL = "ALL"
}

export class Room {
    id: string;
    name: string;
    description?: string;
    encryptedPassword?: string;
    members: RoomMember[];
    maxMembers: number;
    publicKey: string;
    private privateKey: string;
    encryptedMemberKeys: EncryptedRoomKeys;

    constructor(
        id: string,
        name: string,
        keyPair: { publicKey: string; privateKey: string },
        description?: string,
        maxMembers: number = 0,
        encryptedPassword?: string
    ) {
        this.id = id;
        this.name = name;
        this.publicKey = keyPair.publicKey;
        this.privateKey = keyPair.privateKey;
        this.description = description;
        this.maxMembers = maxMembers;
        this.encryptedPassword = encryptedPassword;
        this.members = [];
        this.encryptedMemberKeys = {};
    }

    hasPassword(): boolean {
        return !!this.encryptedPassword;
    }

    async validatePassword(password: string): Promise<boolean> {
        if (!this.encryptedPassword) return true;
        
        try {
            const response = await encryptionBinary.sendCommand({
                type: 'hash_password',
                password
            });
            return response.hash === this.encryptedPassword;
        } catch (error) {
            console.error('Failed to validate password:', error);
            return false;
        }
    }

    addMember(userId: string, username: string, memberPublicKey: string): void {
        if (this.maxMembers > 0 && this.members.length >= this.maxMembers) {
            throw new Error('Room is full');
        }

        // Check if member already exists
        const existingMemberIndex = this.members.findIndex(m => m.userId === userId);
        if (existingMemberIndex !== -1) {
            // Update existing member
            this.members[existingMemberIndex] = { userId, username, publicKey: memberPublicKey };
        } else {
            // Add new member
            this.members.push({ userId, username, publicKey: memberPublicKey });
        }

        // Encrypt room's private key with member's public key
        this.encryptedMemberKeys[userId] = CryptoJS.AES.encrypt(
            this.privateKey,
            memberPublicKey
        ).toString();
    }

    removeMember(userId: string): void {
        this.members = this.members.filter(member => member.userId !== userId);
        delete this.encryptedMemberKeys[userId];
    }

    isMember(userId: string): boolean {
        return this.members.some(member => member.userId === userId);
    }

    getMemberCount(): number {
        return this.members.length;
    }

    getMemberKey(userId: string): string | null {
        return this.encryptedMemberKeys[userId] || null;
    }

    getPublicKey(): string {
        return this.publicKey;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            members: this.members.map(member => ({ userId: member.userId, username: member.username })),
            maxMembers: this.maxMembers,
            hasPassword: this.hasPassword()
        };
    }

    static async createRoom(
        hasPassword: boolean, 
        password?: string, 
        description?: string, 
        maxMembers: number = 0
    ): Promise<Room> {
        try {
            // Generate UUID using Rust service
            const idResponse = await encryptionBinary.sendCommand({
                type: 'generate_uuid'
            });
            const id = idResponse.uuid;

            // Generate room name
            const name = generateRoomName();

            // Generate room key using Rust service
            const keyResponse = await encryptionBinary.sendCommand({
                type: 'generate_room_key'
            });
            const keyPair = {
                publicKey: keyResponse.publicKey,
                privateKey: keyResponse.privateKey
            };

            // Hash password if provided using Rust service
            let encryptedPassword: string | undefined;
            if (hasPassword && password) {
                const passwordResponse = await encryptionBinary.sendCommand({
                    type: 'hash_password',
                    password
                });
                encryptedPassword = passwordResponse.hash;
            }

            return new Room(
                id,
                name,
                keyPair,
                description,
                maxMembers,
                encryptedPassword
            );
        } catch (error) {
            console.error('Failed to create room:', error);
            throw new Error(`Failed to create room: ${error}`);
        }
    }
}
