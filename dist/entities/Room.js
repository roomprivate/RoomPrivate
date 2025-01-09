"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = exports.Permission = void 0;
const encryptionBinary_1 = require("../utils/encryptionBinary");
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
    constructor(id, name, encryptedRoomKey, description, maxMembers = 0, encryptedPassword) {
        this.id = id;
        this.name = name;
        this.encryptedRoomKey = encryptedRoomKey;
        this.description = description;
        this.maxMembers = maxMembers;
        this.encryptedPassword = encryptedPassword;
        this.members = {};
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
    addMember(userId, username) {
        if (this.maxMembers > 0 && Object.keys(this.members).length >= this.maxMembers) {
            return false;
        }
        this.members[userId] = { userId, username };
        return true;
    }
    removeMember(userId) {
        delete this.members[userId];
    }
    isMember(userId) {
        return !!this.members[userId];
    }
    getMemberCount() {
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
            const encryptedRoomKey = keyResponse.key;
            // Hash password if provided using Rust service
            let encryptedPassword;
            if (hasPassword && password) {
                const passwordResponse = await encryptionBinary_1.encryptionBinary.sendCommand({
                    type: 'hash_password',
                    password
                });
                encryptedPassword = passwordResponse.hash;
            }
            return new Room(id, name, encryptedRoomKey, description, maxMembers, encryptedPassword);
        }
        catch (error) {
            console.error('Failed to create room:', error);
            throw new Error(`Failed to create room: ${error}`);
        }
    }
}
exports.Room = Room;
