import CryptoJS from 'crypto-js';

export class UserIdentifier {
    private static readonly PERSISTENT_ID_LENGTH = 8;

    static generateUserId(username: string, ip: string, persistentKey?: string): string {
        if (persistentKey) {
            // For persistent IDs, generate a consistent hash from the key
            const persistentHash = CryptoJS.SHA256(persistentKey).toString();
            const persistentId = persistentHash.substring(0, this.PERSISTENT_ID_LENGTH);
            return `${username}#${persistentId}`;
        } else {
            // For temporary IDs, use IP-based hash
            const ipHash = CryptoJS.SHA256(ip).toString();
            const tempId = ipHash.substring(0, this.PERSISTENT_ID_LENGTH);
            return `${username}#${tempId}`;
        }
    }

    static verifyOwnership(userId: string, ip: string, persistentKey?: string): boolean {
        const [username, id] = userId.split('#');
        if (!username || !id) return false;

        if (persistentKey) {
            const persistentHash = CryptoJS.SHA256(persistentKey).toString();
            return persistentHash.substring(0, this.PERSISTENT_ID_LENGTH) === id;
        } else {
            const ipHash = CryptoJS.SHA256(ip).toString();
            return ipHash.substring(0, this.PERSISTENT_ID_LENGTH) === id;
        }
    }

    static extractUsername(userId: string): string {
        return userId.split('#')[0];
    }

    static extractId(userId: string): string | null {
        const parts = userId.split('#');
        return parts.length > 1 ? parts[1] : null;
    }
}
