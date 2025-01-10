import CryptoJS from 'crypto-js';

export interface EncryptedMessage {
    encryptedContent: string;
    encryptedKey: string;
    iv: string;
}

export class E2EEncryption {
    private static generateMessageKey(): string {
        return CryptoJS.lib.WordArray.random(256/8).toString();
    }

    private static generateIV(): string {
        return CryptoJS.lib.WordArray.random(128/8).toString();
    }

    static encryptMessage(message: string, roomPublicKey: string): EncryptedMessage {
        const messageKey = this.generateMessageKey();
        const iv = this.generateIV();

        // Encrypt the message with the message key
        const encryptedContent = CryptoJS.AES.encrypt(message, messageKey, {
            iv: CryptoJS.enc.Hex.parse(iv),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }).toString();

        // Encrypt the message key with the room's public key
        const encryptedKey = CryptoJS.AES.encrypt(messageKey, roomPublicKey).toString();

        return {
            encryptedContent,
            encryptedKey,
            iv
        };
    }

    static decryptMessage(encryptedMessage: EncryptedMessage, roomPrivateKey: string): string {
        try {
            // Decrypt the message key using room's private key
            const messageKey = CryptoJS.AES.decrypt(
                encryptedMessage.encryptedKey,
                roomPrivateKey
            ).toString(CryptoJS.enc.Utf8);

            // Decrypt the actual message using the decrypted message key
            const decryptedBytes = CryptoJS.AES.decrypt(
                encryptedMessage.encryptedContent,
                messageKey,
                {
                    iv: CryptoJS.enc.Hex.parse(encryptedMessage.iv),
                    mode: CryptoJS.mode.CBC,
                    padding: CryptoJS.pad.Pkcs7
                }
            );

            return decryptedBytes.toString(CryptoJS.enc.Utf8);
        } catch (error) {
            console.error('Failed to decrypt message:', error);
            return '';
        }
    }

    static generateRoomKeyPair(): { publicKey: string; privateKey: string } {
        const privateKey = CryptoJS.lib.WordArray.random(256/8).toString();
        const publicKey = CryptoJS.lib.WordArray.random(256/8).toString();
        return { publicKey, privateKey };
    }
}
