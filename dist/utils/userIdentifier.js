"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserIdentifier = void 0;
const crypto_js_1 = __importDefault(require("crypto-js"));
class UserIdentifier {
    static generateUserId(username, ip, persistentKey) {
        if (persistentKey) {
            // For persistent IDs, generate a consistent hash from the key
            const persistentHash = crypto_js_1.default.SHA256(persistentKey).toString();
            const persistentId = persistentHash.substring(0, this.PERSISTENT_ID_LENGTH);
            return `${username}#${persistentId}`;
        }
        else {
            // For temporary IDs, use IP-based hash
            const ipHash = crypto_js_1.default.SHA256(ip).toString();
            const tempId = ipHash.substring(0, this.PERSISTENT_ID_LENGTH);
            return `${username}#${tempId}`;
        }
    }
    static verifyOwnership(userId, ip, persistentKey) {
        const [username, id] = userId.split('#');
        if (!username || !id)
            return false;
        if (persistentKey) {
            const persistentHash = crypto_js_1.default.SHA256(persistentKey).toString();
            return persistentHash.substring(0, this.PERSISTENT_ID_LENGTH) === id;
        }
        else {
            const ipHash = crypto_js_1.default.SHA256(ip).toString();
            return ipHash.substring(0, this.PERSISTENT_ID_LENGTH) === id;
        }
    }
    static extractUsername(userId) {
        return userId.split('#')[0];
    }
    static extractId(userId) {
        const parts = userId.split('#');
        return parts.length > 1 ? parts[1] : null;
    }
}
exports.UserIdentifier = UserIdentifier;
UserIdentifier.PERSISTENT_ID_LENGTH = 8;
