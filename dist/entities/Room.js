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
    validatePassword(password) {
        if (!this.encryptedPassword)
            return true;
        const hashedPassword = CryptoJS.SHA256(password).toString();
        return hashedPassword === this.encryptedPassword;
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
        const id = (0, uuid_1.v4)();
        const name = (0, wordLists_1.generateRoomName)();
        const encryptedRoomKey = CryptoJS.SHA256(id).toString();
        const encryptedPassword = hasPassword && password
            ? CryptoJS.SHA256(password).toString()
            : undefined;
        return new Room(id, name, encryptedRoomKey, description, maxMembers, encryptedPassword);
    }
}
exports.Room = Room;
