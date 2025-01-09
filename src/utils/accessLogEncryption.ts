import * as crypto from 'crypto';
import { randomBytes } from 'crypto';

interface AccessLogData {
    userIp: string;
    userGeoLoc: string;
    timestamp: string | Date;
    platform: string;
    device: string;
}

class AccessLogEncryption {
    private static readonly CHUNK_SIZE = 190; // Safe size for RSA-2048

    private static generateRandomSeed(): string {
        return randomBytes(32).toString('hex');
    }

    private static obfuscateString(input: string, seed: string): string {
        const pattern = crypto.createHash('sha256').update(seed).digest('hex');
        return input.split('').map((char, i) => 
            char + pattern.charAt(i % pattern.length)
        ).join('');
    }

    private static invertCharacter(char: string): string {
        if (/[0-9]/.test(char)) {
            return String.fromCharCode(90 - (parseInt(char) * 2));
        }
        if (/[A-Z]/i.test(char)) {
            return String.fromCharCode(57 - (char.toUpperCase().charCodeAt(0) - 65));
        }
        return char;
    }

    private static async encryptWithAES(data: string): Promise<{ key: Buffer; iv: Buffer; encrypted: string }> {
        const key = randomBytes(32); // AES-256
        const iv = randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag();
        
        // Combine auth tag with encrypted data
        const finalEncrypted = Buffer.concat([
            Buffer.from(encrypted, 'base64'),
            authTag
        ]).toString('base64');

        return { key, iv, encrypted: finalEncrypted };
    }

    private static async encryptWithRSA(data: Buffer): Promise<{ publicKey: string; encryptedData: string }> {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        // Split data into chunks and encrypt each chunk
        const chunks: Buffer[] = [];
        for (let i = 0; i < data.length; i += this.CHUNK_SIZE) {
            const chunk = data.slice(i, i + this.CHUNK_SIZE);
            const encryptedChunk = crypto.publicEncrypt(
                {
                    key: publicKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256'
                },
                chunk
            );
            chunks.push(encryptedChunk);
        }

        // Combine all encrypted chunks
        const encryptedData = Buffer.concat(chunks).toString('base64');

        // Immediately delete private key
        crypto.randomFill(Buffer.from(privateKey), () => {});

        return { publicKey, encryptedData };
    }

    public static async encryptAccessLog(data: AccessLogData): Promise<{ publicKey: string; encryptedData: string }> {
        try {
            // Step 1: Obfuscate each field with different random seeds
            const seeds = Array.from({ length: 5 }, () => this.generateRandomSeed());
            const obfuscatedData = {
                userIp: this.obfuscateString(data.userIp, seeds[0]),
                userGeoLoc: this.obfuscateString(data.userGeoLoc, seeds[1]),
                timestamp: this.obfuscateString(typeof data.timestamp === 'string' ? data.timestamp : data.timestamp.toISOString(), seeds[2]),
                platform: this.obfuscateString(data.platform, seeds[3]),
                device: this.obfuscateString(data.device, seeds[4])
            };

            // Step 2: Invert characters
            const invertedData = JSON.stringify(obfuscatedData)
                .split('')
                .map(char => this.invertCharacter(char))
                .join('');

            // Step 3: First layer - AES encryption
            const aesResult = await this.encryptWithAES(invertedData);
            
            // Step 4: Combine AES key, IV, and encrypted data
            const combinedData = Buffer.concat([
                aesResult.key,
                aesResult.iv,
                Buffer.from(aesResult.encrypted, 'base64')
            ]);

            // Step 5: Second layer - RSA encryption
            const finalResult = await this.encryptWithRSA(combinedData);

            // Clean up sensitive data
            crypto.randomFill(aesResult.key, () => {});
            crypto.randomFill(aesResult.iv, () => {});
            
            return finalResult;
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Encryption failed');
        }
    }
}

export { AccessLogEncryption, AccessLogData };
