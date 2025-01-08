import { v4 as uuidv4 } from 'uuid';
import * as CryptoJS from 'crypto-js';
import { UserIdentifier } from '../utils/userIdentifier';
import { generateRoomName } from '../utils/wordLists';

export interface RoomMember {
    userId: string;
    roles: string[];
    username?: string;
}

export interface Role {
    id: string;
    name: string;
    color: string;
    permissions: Permission[];
    position?: number;
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
    ownerId: string;
    members: { [userId: string]: RoomMember };
    roles: Role[];
    encryptedRoomKey: string;
    maxMembers: number;

    constructor(
        id: string,
        name: string,
        ownerId: string,
        encryptedRoomKey: string,
        description?: string,
        maxMembers: number = 0,
        encryptedPassword?: string
    ) {
        this.id = id;
        this.name = name;
        this.ownerId = ownerId;
        this.encryptedRoomKey = encryptedRoomKey;
        this.description = description;
        this.maxMembers = maxMembers;
        this.encryptedPassword = encryptedPassword;
        
        this.roles = [
            {
                id: 'owner',
                name: 'Owner',
                color: '#ff5555',
                permissions: [Permission.ALL],
                position: 100
            },
            {
                id: 'member',
                name: 'Member',
                color: '#4a90e2',
                permissions: [Permission.CHAT, Permission.VIEW],
                position: 1
            }
        ];

        this.members = {};
    }

    static async createRoom(
        hasPassword: boolean, 
        password?: string, 
        description?: string, 
        maxMembers: number = 0,
        ownerIp: string = '',
        ownerUsername: string = '',
        ownerPersistentKey?: string
    ): Promise<Room> {
        const id = uuidv4();
        const name = generateRoomName();
        const roomKey = CryptoJS.lib.WordArray.random(256/8);
        const encryptedRoomKey = roomKey.toString();
        
        const encryptedPassword = hasPassword && password 
            ? CryptoJS.AES.encrypt(password, roomKey).toString()
            : undefined;
            
        const ownerId = await UserIdentifier.generateUserId(ownerUsername, ownerIp, ownerPersistentKey);

        return new Room(
            id,
            name,
            ownerId,
            encryptedRoomKey,
            description,
            maxMembers,
            encryptedPassword
        );
    }

    hasPassword(): boolean {
        return !!this.encryptedPassword;
    }

    validatePassword(password: string): boolean {
        if (!this.encryptedPassword) return true;
        try {
            const decrypted = CryptoJS.AES.decrypt(
                this.encryptedPassword,
                this.encryptedRoomKey
            ).toString(CryptoJS.enc.Utf8);
            return decrypted === password;
        } catch {
            return false;
        }
    }

    addMember(userId: string, username?: string): boolean {
        if (this.maxMembers > 0 && Object.keys(this.members).length >= this.maxMembers) {
            return false;
        }
        this.members[userId] = { userId, roles: ['member'], username };
        return true;
    }

    removeMember(userId: string): void {
        delete this.members[userId];
    }

    getMemberRoles(userId: string): Role[] {
        const member = this.members[userId];
        if (!member) return [];
        return this.roles.filter(role => member.roles.includes(role.id));
    }

    getMemberList(): string[] {
        return Object.keys(this.members);
    }

    hasPermission(userId: string, permission: Permission): boolean {
        if (userId === this.ownerId) return true;
        const roles = this.getMemberRoles(userId);
        return roles.some(role => 
            role.permissions.includes(Permission.ALL) || 
            role.permissions.includes(permission)
        );
    }

    addRole(name: string, color: string, permissions: Permission[], position: number): Role {
        const role: Role = {
            id: uuidv4(),
            name,
            color,
            permissions,
            position
        };
        this.roles.push(role);
        return role;
    }

    assignRole(userId: string, roleId: string): boolean {
        const member = this.members[userId];
        if (!member) return false;
        if (!member.roles.includes(roleId)) {
            member.roles.push(roleId);
        }
        return true;
    }

    removeRole(userId: string, roleId: string): boolean {
        const member = this.members[userId];
        if (!member) return false;
        member.roles = member.roles.filter(id => id !== roleId);
        return true;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            ownerId: this.ownerId,
            members: this.members,
            roles: this.roles,
            maxMembers: this.maxMembers,
            hasPassword: this.hasPassword()
        };
    }
}
