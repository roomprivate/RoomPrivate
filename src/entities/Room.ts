import { encryptionBinary } from '../utils/encryptionBinary';
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
            const encryptedRoomKey = keyResponse.key;

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
                encryptedRoomKey,
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
