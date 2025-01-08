"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = exports.Permission = void 0;
const uuid_1 = require("uuid");
const CryptoJS = __importStar(require("crypto-js"));
const userIdentifier_1 = require("../utils/userIdentifier");
const wordLists_1 = require("../utils/wordLists");
var Permission;
(function (Permission) {
    Permission["CHAT"] = "CHAT";
    Permission["VIEW"] = "VIEW";
    Permission["KICK"] = "KICK";
    Permission["BAN"] = "BAN";
    Permission["MANAGE_ROLES"] = "MANAGE_ROLES";
    Permission["MANAGE_MESSAGES"] = "MANAGE_MESSAGES";
    Permission["ALL"] = "ALL";
})(Permission || (exports.Permission = Permission = {}));
class Room {
    constructor(id, name, ownerId, encryptedRoomKey, description, maxMembers = 0, encryptedPassword) {
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
    static async createRoom(hasPassword, password, description, maxMembers = 0, ownerIp = '', ownerUsername = '', ownerPersistentKey) {
        const id = (0, uuid_1.v4)();
        const name = (0, wordLists_1.generateRoomName)();
        const roomKey = CryptoJS.lib.WordArray.random(256 / 8);
        const encryptedRoomKey = roomKey.toString();
        const encryptedPassword = hasPassword && password
            ? CryptoJS.AES.encrypt(password, roomKey).toString()
            : undefined;
        const ownerId = await userIdentifier_1.UserIdentifier.generateUserId(ownerUsername, ownerIp, ownerPersistentKey);
        return new Room(id, name, ownerId, encryptedRoomKey, description, maxMembers, encryptedPassword);
    }
    hasPassword() {
        return !!this.encryptedPassword;
    }
    validatePassword(password) {
        if (!this.encryptedPassword)
            return true;
        try {
            const decrypted = CryptoJS.AES.decrypt(this.encryptedPassword, this.encryptedRoomKey).toString(CryptoJS.enc.Utf8);
            return decrypted === password;
        }
        catch {
            return false;
        }
    }
    addMember(userId, username) {
        if (this.maxMembers > 0 && Object.keys(this.members).length >= this.maxMembers) {
            return false;
        }
        this.members[userId] = { userId, roles: ['member'], username };
        return true;
    }
    removeMember(userId) {
        delete this.members[userId];
    }
    getMemberRoles(userId) {
        const member = this.members[userId];
        if (!member)
            return [];
        return this.roles.filter(role => member.roles.includes(role.id));
    }
    getMemberList() {
        return Object.keys(this.members);
    }
    hasPermission(userId, permission) {
        if (userId === this.ownerId)
            return true;
        const roles = this.getMemberRoles(userId);
        return roles.some(role => role.permissions.includes(Permission.ALL) ||
            role.permissions.includes(permission));
    }
    addRole(name, color, permissions, position) {
        const role = {
            id: (0, uuid_1.v4)(),
            name,
            color,
            permissions,
            position
        };
        this.roles.push(role);
        return role;
    }
    assignRole(userId, roleId) {
        const member = this.members[userId];
        if (!member)
            return false;
        if (!member.roles.includes(roleId)) {
            member.roles.push(roleId);
        }
        return true;
    }
    removeRole(userId, roleId) {
        const member = this.members[userId];
        if (!member)
            return false;
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
exports.Room = Room;
