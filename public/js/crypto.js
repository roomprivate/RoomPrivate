const crypto = {
    key: null,
    nonce: null,

    async generateKey(keyString) {
        try {
            const keyData = atob(keyString);
            const keyArray = new Uint8Array(keyData.length);
            for (let i = 0; i < keyData.length; i++) {
                keyArray[i] = keyData.charCodeAt(i);
            }
            
            this.nonce = window.crypto.getRandomValues(new Uint8Array(12));
            
            this.key = await window.crypto.subtle.importKey(
                "raw",
                keyArray,
                { name: "AES-GCM" },
                false,
                ["encrypt", "decrypt"]
            );
            console.log('Key generated successfully');
        } catch (error) {
            console.error('Failed to generate key:', error);
            throw error;
        }
    },

    async encrypt(text) {
        if (!this.key) {
            throw new Error('Encryption key not set');
        }

        try {
            const encoder = new TextEncoder();
            const encodedText = encoder.encode(text);
            const encryptedData = await window.crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: this.nonce
                },
                this.key,
                encodedText
            );

            const encryptedArray = new Uint8Array(encryptedData);
            const resultArray = new Uint8Array(this.nonce.length + encryptedArray.length);
            resultArray.set(this.nonce);
            resultArray.set(encryptedArray, this.nonce.length);

            return btoa(String.fromCharCode.apply(null, resultArray));
        } catch (error) {
            console.error('Encryption failed:', error);
            throw error;
        }
    },

    async decrypt(encodedMessage) {
        if (!this.key) {
            throw new Error('Decryption key not set');
        }

        try {
            const messageArray = new Uint8Array(atob(encodedMessage).split('').map(char => char.charCodeAt(0)));
            const nonce = messageArray.slice(0, 12);
            const encryptedData = messageArray.slice(12);

            const decryptedData = await window.crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: nonce
                },
                this.key,
                encryptedData
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedData);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw error;
        }
    }
};

export default crypto;
