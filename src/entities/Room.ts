import { Entity, Column, PrimaryColumn } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as CryptoJS from 'crypto-js';
import { UserIdentifier } from '../utils/userIdentifier';
import { generateRoomName } from '../utils/wordLists';

export enum Permission {
    ALL = 'all',
    CHAT = 'chat',
    VIEW = 'view',
    MANAGE_ROLES = 'manage_roles',
    KICK_USER = 'kick_user',
    BAN_USER = 'ban_user'
}

export interface RoomMember {
    userId: string;
    roles: string[];
}

export interface Role {
    id: string;
    name: string;
    color: string;
    permissions: Permission[];
    position?: number;
}

@Entity()
export class Room {
    @PrimaryColumn()
    id!: string;

    @Column()
    name!: string;

    @Column({ nullable: true })
    description?: string;

    @Column({ nullable: true })
    encryptedPassword?: string;

    @Column()
    ownerId!: string;

    @Column('simple-json')
    members: { [userId: string]: RoomMember } = {};

    @Column('simple-json')
    roles: Role[] = [];

    @Column()
    encryptedRoomKey!: string;

    @Column({ default: 0 })
    maxMembers: number = 0;

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
        
        // Initialize roles
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

        // Initialize empty members
        this.members = {};
    }

    static createRoom(
        hasPassword: boolean, 
        password?: string, 
        description?: string, 
        maxMembers: number = 0,
        ownerIp: string = '',
        ownerUsername: string = '',
        ownerPersistentKey?: string
    ): Room {
        const id = Buffer.from(uuidv4()).toString('base64');
        const name = generateRoomName();
        const encryptedRoomKey = CryptoJS.lib.WordArray.random(256/8).toString();
        const encryptedPassword = hasPassword && password 
            ? CryptoJS.AES.encrypt(password, process.env.SERVER_SECRET || 'default-secret').toString()
            : undefined;
            
        const ownerId = UserIdentifier.generateUserId(ownerUsername, ownerIp, ownerPersistentKey);

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
        return this.encryptedPassword === password;
    }

    addMember(userId: string): boolean {
        if (this.maxMembers > 0 && Object.keys(this.members).length >= this.maxMembers) {
            return false;
        }
        if (!this.members[userId]) {
            this.members[userId] = {
                userId,
                roles: ['member']
            };
        }
        return true;
    }

    removeMember(userId: string): void {
        if (userId === this.ownerId) return; // Don't remove owner
        delete this.members[userId];
    }

    getMemberRoles(userId: string): Role[] {
        const memberRoles = this.members[userId]?.roles || [];
        return this.roles.filter(role => 
            memberRoles.includes(role.id) || 
            (role.id === 'owner' && userId === this.ownerId)
        );
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
        this.roles.sort((a, b) => (b.position || 0) - (a.position || 0));
        return role;
    }

    assignRole(userId: string, roleId: string): boolean {
        const member = this.members[userId];
        if (!member) return false;
        if (!member.roles.includes(roleId)) {
            member.roles.push(roleId);
            return true;
        }
        return false;
    }

    removeRole(userId: string, roleId: string): boolean {
        const member = this.members[userId];
        if (!member) return false;
        const index = member.roles.indexOf(roleId);
        if (index > -1 && roleId !== 'owner') {
            member.roles.splice(index, 1);
            return true;
        }
        return false;
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
