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
const encryptionBinary_1 = require("../utils/encryptionBinary");
const wordLists_1 = require("../utils/wordLists");
const CryptoJS = __importStar(require("crypto-js"));
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
    constructor(id, name, keyPair, description, maxMembers = 0, encryptedPassword) {
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
    hasPassword() {
        return !!this.encryptedPassword;
    }
    async validatePassword(password) {
        if (!this.encryptedPassword)
            return true;
        try {
            const response = await encryptionBinary_1.encryptionBinary.sendCommand({
                type: 'hash_password',
                password
            });
            return response.hash === this.encryptedPassword;
        }
        catch (error) {
            console.error('Failed to validate password:', error);
            return false;
        }
    }
    addMember(userId, username, memberPublicKey) {
        if (this.maxMembers > 0 && this.members.length >= this.maxMembers) {
            throw new Error('Room is full');
        }
        // Check if member already exists
        const existingMemberIndex = this.members.findIndex(m => m.userId === userId);
        if (existingMemberIndex !== -1) {
            // Update existing member
            this.members[existingMemberIndex] = { userId, username, publicKey: memberPublicKey };
        }
        else {
            // Add new member
            this.members.push({ userId, username, publicKey: memberPublicKey });
        }
        // Encrypt room's private key with member's public key
        this.encryptedMemberKeys[userId] = CryptoJS.AES.encrypt(this.privateKey, memberPublicKey).toString();
    }
    removeMember(userId) {
        this.members = this.members.filter(member => member.userId !== userId);
        delete this.encryptedMemberKeys[userId];
    }
    isMember(userId) {
        return this.members.some(member => member.userId === userId);
    }
    getMemberCount() {
        return this.members.length;
    }
    getMemberKey(userId) {
        return this.encryptedMemberKeys[userId] || null;
    }
    getPublicKey() {
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
    static async createRoom(hasPassword, password, description, maxMembers = 0) {
        try {
            // Generate UUID using Rust service
            const idResponse = await encryptionBinary_1.encryptionBinary.sendCommand({
                type: 'generate_uuid'
            });
            const id = idResponse.uuid;
            // Generate room name
            const name = (0, wordLists_1.generateRoomName)();
            // Generate room key using Rust service
            const keyResponse = await encryptionBinary_1.encryptionBinary.sendCommand({
                type: 'generate_room_key'
            });
            const keyPair = {
                publicKey: keyResponse.publicKey,
                privateKey: keyResponse.privateKey
            };
            // Hash password if provided using Rust service
            let encryptedPassword;
            if (hasPassword && password) {
                const passwordResponse = await encryptionBinary_1.encryptionBinary.sendCommand({
                    type: 'hash_password',
                    password
                });
                encryptedPassword = passwordResponse.hash;
            }
            return new Room(id, name, keyPair, description, maxMembers, encryptedPassword);
        }
        catch (error) {
            console.error('Failed to create room:', error);
            throw new Error(`Failed to create room: ${error}`);
        }
    }
}
exports.Room = Room;
