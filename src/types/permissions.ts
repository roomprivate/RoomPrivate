export enum Permission {
    KICK_USER = 'KICK_USER',
    EDIT_ROOM = 'EDIT_ROOM',
    MANAGE_ROLES = 'MANAGE_ROLES',
    DELETE_ROOM = 'DELETE_ROOM',  // Owner only
    BAN_USER = 'BAN_USER',
    UNBAN_USER = 'UNBAN_USER',
    PIN_MESSAGE = 'PIN_MESSAGE',
    DELETE_MESSAGE = 'DELETE_MESSAGE',
    MUTE_USER = 'MUTE_USER',
    UNMUTE_USER = 'UNMUTE_USER'
}

export interface Role {
    id: string;
    name: string;
    color: string;
    permissions: Permission[];
    position: number; // Higher position means more power
}

export interface RoomMember {
    userId: string;
    roles: string[]; // Role IDs
    isMuted?: boolean;
    mutedUntil?: Date;
}

export const OWNER_ROLE: Role = {
    id: 'owner',
    name: 'Owner',
    color: '#ff0000',
    permissions: Object.values(Permission),
    position: 1000
};

export const DEFAULT_ROLE: Role = {
    id: 'default',
    name: 'Member',
    color: '#808080',
    permissions: [],
    position: 0
};
