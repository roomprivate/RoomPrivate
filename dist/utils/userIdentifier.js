"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserIdentifier = void 0;
const crypto_js_1 = __importDefault(require("crypto-js"));
const dns_1 = __importDefault(require("dns"));
const util_1 = require("util");
class UserIdentifier {
    static generateIPv6() {
        // Generate 8 groups of 4 hex digits (128 bits total)
        const groups = [];
        for (let i = 0; i < 8; i++) {
            const group = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
            groups.push(group);
        }
        return groups.join(':');
    }
    static generateIPv4() {
        // Generate 4 octets for IPv4
        const octets = [];
        for (let i = 0; i < 4; i++) {
            octets.push(Math.floor(Math.random() * 256));
        }
        return octets.join('.');
    }
    static async hasIPv6Support() {
        try {
            const lookup6 = (0, util_1.promisify)(dns_1.default.lookup);
            await lookup6('ip6only.me', { family: 6 });
            return true;
        }
        catch {
            return false;
        }
    }
    static async generateUserId(username, _ip, persistentKey) {
        if (persistentKey) {
            // For persistent IDs, generate a consistent hash from the key
            const persistentHash = crypto_js_1.default.SHA256(persistentKey).toString();
            const persistentId = persistentHash.substring(0, this.ID_LENGTH);
            return `${username}#${persistentId}`;
        }
        else {
            // Try IPv6 first, fall back to IPv4
            let tempId;
            if (await this.hasIPv6Support()) {
                // Generate a temporary ID using IPv6-like format
                const ipv6 = this.generateIPv6();
                tempId = crypto_js_1.default.SHA256(ipv6).toString().substring(0, this.ID_LENGTH);
            }
            else {
                // Fall back to IPv4 format
                const ipv4 = this.generateIPv4();
                tempId = crypto_js_1.default.SHA256(ipv4).toString().substring(0, this.ID_LENGTH);
            }
            // Create a new object as key that will be immediately garbage collected
            UserIdentifier.tempIdCache.set(new Object(), tempId);
            return `${username}#${tempId}`;
        }
    }
    static async verifyOwnership(userId, _ip, persistentKey) {
        const [username, id] = userId.split('#');
        if (!username || !id)
            return false;
        // If persistent key is provided, verify against it
        if (persistentKey) {
            const persistentHash = crypto_js_1.default.SHA256(persistentKey).toString();
            const expectedId = persistentHash.substring(0, this.ID_LENGTH);
            return id === expectedId;
        }
        // For temporary IDs, we can't verify since they're random and immediately forgotten
        // Just verify the format is correct
        return id.length === this.ID_LENGTH;
    }
    static extractUsername(userId) {
        const [username] = userId.split('#');
        return username || '';
    }
    static async isTemporaryId(userId, persistentKey) {
        if (!persistentKey)
            return true;
        const [_, id] = userId.split('#');
        if (!id)
            return true;
        const persistentHash = crypto_js_1.default.SHA256(persistentKey).toString();
        const expectedId = persistentHash.substring(0, this.ID_LENGTH);
        return id !== expectedId;
    }
}
exports.UserIdentifier = UserIdentifier;
UserIdentifier.ID_LENGTH = 8;
// WeakMap automatically removes entries when keys are garbage collected
UserIdentifier.tempIdCache = new WeakMap();
