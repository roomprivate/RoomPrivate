import CryptoJS from 'crypto-js';

export class UserIdentifier {
    private static readonly ID_LENGTH = 8;
    // WeakMap automatically removes entries when keys are garbage collected
    private static readonly tempIdCache = new WeakMap<object, string>();

    static generateUserId(username: string, _ip: string, persistentKey?: string): string {
        if (persistentKey) {
            // For persistent IDs, generate a consistent hash from the key
            const persistentHash = CryptoJS.SHA256(persistentKey).toString();
            const persistentId = persistentHash.substring(0, this.ID_LENGTH);
            return `${username}#${persistentId}`;
        } else {
            // Generate a completely random temporary ID that will be forgotten
            const randomBytes = CryptoJS.lib.WordArray.random(32); // 256 bits
            const tempId = randomBytes.toString().substring(0, this.ID_LENGTH);
            
            // Create a new object as key that will be immediately garbage collected
            // This ensures the ID cannot be stored or retrieved later
            UserIdentifier.tempIdCache.set(new Object(), tempId);
            
            return `${username}#${tempId}`;
        }
    }

    static verifyOwnership(userId: string, _ip: string, persistentKey?: string): boolean {
        const [username, id] = userId.split('#');
        if (!username || !id) return false;

        // If persistent key is provided, verify against it
        if (persistentKey) {
            const persistentHash = CryptoJS.SHA256(persistentKey).toString();
            const expectedId = persistentHash.substring(0, this.ID_LENGTH);
            return id === expectedId;
        }

        // For temporary IDs, we can't verify since they're random and immediately forgotten
        // Just verify the format is correct
        return id.length === this.ID_LENGTH;
    }

    static extractUsername(userId: string): string {
        const [username] = userId.split('#');
        return username || '';
    }

    static isTemporaryId(userId: string, persistentKey?: string): boolean {
        if (!persistentKey) return true;
        
        const [_, id] = userId.split('#');
        if (!id) return true;

        const persistentHash = CryptoJS.SHA256(persistentKey).toString();
        const expectedId = persistentHash.substring(0, this.ID_LENGTH);
        return id !== expectedId;
    }
}
