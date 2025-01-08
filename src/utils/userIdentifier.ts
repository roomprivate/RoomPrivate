import CryptoJS from 'crypto-js';
import dns from 'dns';
import { promisify } from 'util';

export class UserIdentifier {
    private static readonly ID_LENGTH = 8;
    // WeakMap automatically removes entries when keys are garbage collected
    private static readonly tempIdCache = new WeakMap<object, string>();

    private static generateIPv6(): string {
        // Generate 8 groups of 4 hex digits (128 bits total)
        const groups: string[] = [];
        for (let i = 0; i < 8; i++) {
            const group = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
            groups.push(group);
        }
        return groups.join(':');
    }

    private static generateIPv4(): string {
        // Generate 4 octets for IPv4
        const octets: number[] = [];
        for (let i = 0; i < 4; i++) {
            octets.push(Math.floor(Math.random() * 256));
        }
        return octets.join('.');
    }

    private static async hasIPv6Support(): Promise<boolean> {
        try {
            const lookup6 = promisify(dns.lookup);
            await lookup6('ip6only.me', { family: 6 });
            return true;
        } catch {
            return false;
        }
    }

    static async generateUserId(username: string, _ip: string, persistentKey?: string): Promise<string> {
        if (persistentKey) {
            // For persistent IDs, generate a consistent hash from the key
            const persistentHash = CryptoJS.SHA256(persistentKey).toString();
            const persistentId = persistentHash.substring(0, this.ID_LENGTH);
            return `${username}#${persistentId}`;
        } else {
            // Try IPv6 first, fall back to IPv4
            let tempId: string;
            
            if (await this.hasIPv6Support()) {
                // Generate a temporary ID using IPv6-like format
                const ipv6 = this.generateIPv6();
                tempId = CryptoJS.SHA256(ipv6).toString().substring(0, this.ID_LENGTH);
            } else {
                // Fall back to IPv4 format
                const ipv4 = this.generateIPv4();
                tempId = CryptoJS.SHA256(ipv4).toString().substring(0, this.ID_LENGTH);
            }
            
            // Create a new object as key that will be immediately garbage collected
            UserIdentifier.tempIdCache.set(new Object(), tempId);
            
            return `${username}#${tempId}`;
        }
    }

    static async verifyOwnership(userId: string, _ip: string, persistentKey?: string): Promise<boolean> {
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

    static async isTemporaryId(userId: string, persistentKey?: string): Promise<boolean> {
        if (!persistentKey) return true;
        
        const [_, id] = userId.split('#');
        if (!id) return true;

        const persistentHash = CryptoJS.SHA256(persistentKey).toString();
        const expectedId = persistentHash.substring(0, this.ID_LENGTH);
        return id !== expectedId;
    }
}
