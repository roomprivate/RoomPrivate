import { v4 as uuidv4 } from 'uuid';
import * as CryptoJS from 'crypto-js';
import { generateRoomName } from '../utils/wordLists';

export interface RoomMember {
    userId: string;
    username: string;
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
    members: { [userId: string]: RoomMember };
    maxMembers: number;
    encryptedRoomKey: string;

    constructor(
        id: string,
        name: string,
        encryptedRoomKey: string,
        description?: string,
        maxMembers: number = 0,
        encryptedPassword?: string
    ) {
        this.id = id;
        this.name = name;
        this.encryptedRoomKey = encryptedRoomKey;
        this.description = description;
        this.maxMembers = maxMembers;
        this.encryptedPassword = encryptedPassword;
        this.members = {};
    }

    hasPassword(): boolean {
        return !!this.encryptedPassword;
    }

    validatePassword(password: string): boolean {
        if (!this.encryptedPassword) return true;
        const hashedPassword = CryptoJS.SHA256(password).toString();
        return hashedPassword === this.encryptedPassword;
    }

    addMember(userId: string, username: string): boolean {
        if (this.maxMembers > 0 && Object.keys(this.members).length >= this.maxMembers) {
            return false;
        }

        this.members[userId] = { userId, username };
        return true;
    }

    removeMember(userId: string): void {
        delete this.members[userId];
    }

    isMember(userId: string): boolean {
        return !!this.members[userId];
    }

    getMemberCount(): number {
        return Object.keys(this.members).length;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            members: this.members,
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
        const id = uuidv4();
        const name = generateRoomName();
        const encryptedRoomKey = CryptoJS.SHA256(id).toString();
        const encryptedPassword = hasPassword && password 
            ? CryptoJS.SHA256(password).toString()
            : undefined;
            
        return new Room(
            id,
            name,
            encryptedRoomKey,
            description,
            maxMembers,
            encryptedPassword
        );
    }
}
