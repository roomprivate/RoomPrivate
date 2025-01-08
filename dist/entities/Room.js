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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var Room_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = exports.Permission = void 0;
const typeorm_1 = require("typeorm");
const uuid_1 = require("uuid");
const CryptoJS = __importStar(require("crypto-js"));
const userIdentifier_1 = require("../utils/userIdentifier");
const wordLists_1 = require("../utils/wordLists");
var Permission;
(function (Permission) {
    Permission["ALL"] = "all";
    Permission["CHAT"] = "chat";
    Permission["VIEW"] = "view";
    Permission["MANAGE_ROLES"] = "manage_roles";
    Permission["KICK_USER"] = "kick_user";
    Permission["BAN_USER"] = "ban_user";
})(Permission || (exports.Permission = Permission = {}));
let Room = Room_1 = class Room {
    constructor(id, name, ownerId, encryptedRoomKey, description, maxMembers = 0, encryptedPassword) {
        this.members = {};
        this.roles = [];
        this.maxMembers = 0;
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
    static createRoom(hasPassword, password, description, maxMembers = 0, ownerIp = '', ownerUsername = '', ownerPersistentKey) {
        const id = Buffer.from((0, uuid_1.v4)()).toString('base64');
        const name = (0, wordLists_1.generateRoomName)();
        const encryptedRoomKey = CryptoJS.lib.WordArray.random(256 / 8).toString();
        const encryptedPassword = hasPassword && password
            ? CryptoJS.AES.encrypt(password, process.env.SERVER_SECRET || 'default-secret').toString()
            : undefined;
        const ownerId = userIdentifier_1.UserIdentifier.generateUserId(ownerUsername, ownerIp, ownerPersistentKey);
        return new Room_1(id, name, ownerId, encryptedRoomKey, description, maxMembers, encryptedPassword);
    }
    hasPassword() {
        return !!this.encryptedPassword;
    }
    validatePassword(password) {
        return this.encryptedPassword === password;
    }
    addMember(userId) {
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
    removeMember(userId) {
        if (userId === this.ownerId)
            return; // Don't remove owner
        delete this.members[userId];
    }
    getMemberRoles(userId) {
        const memberRoles = this.members[userId]?.roles || [];
        return this.roles.filter(role => memberRoles.includes(role.id) ||
            (role.id === 'owner' && userId === this.ownerId));
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
        this.roles.sort((a, b) => (b.position || 0) - (a.position || 0));
        return role;
    }
    assignRole(userId, roleId) {
        const member = this.members[userId];
        if (!member)
            return false;
        if (!member.roles.includes(roleId)) {
            member.roles.push(roleId);
            return true;
        }
        return false;
    }
    removeRole(userId, roleId) {
        const member = this.members[userId];
        if (!member)
            return false;
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
};
exports.Room = Room;
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", String)
], Room.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Room.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Room.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Room.prototype, "encryptedPassword", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Room.prototype, "ownerId", void 0);
__decorate([
    (0, typeorm_1.Column)('simple-json'),
    __metadata("design:type", Object)
], Room.prototype, "members", void 0);
__decorate([
    (0, typeorm_1.Column)('simple-json'),
    __metadata("design:type", Array)
], Room.prototype, "roles", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Room.prototype, "encryptedRoomKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Room.prototype, "maxMembers", void 0);
exports.Room = Room = Room_1 = __decorate([
    (0, typeorm_1.Entity)(),
    __metadata("design:paramtypes", [String, String, String, String, String, Number, String])
], Room);
