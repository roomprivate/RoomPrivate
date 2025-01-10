// Utility functions for chat application

/**
 * Generates a random color for a user
 * @returns {string} A hex color code
 */
function generateUserColor() {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
        '#E74C3C', '#2ECC71', '#F1C40F', '#1ABC9C'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Escapes HTML special characters
 * @param {string} text - The text to escape
 * @returns {string} The escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Formats a timestamp into a readable string
 * @param {number} timestamp - The timestamp in milliseconds
 * @returns {string} The formatted timestamp
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
}

/**
 * Generates initials from a username
 * @param {string} username - The username
 * @returns {string} The initials
 */
function generateInitials(username) {
    return username
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

/**
 * Encrypts a message using CryptoJS
 * @param {string} message - The message to encrypt
 * @param {string} key - The encryption key
 * @returns {Object} The encrypted message and IV
 */
function encryptMessage(message, key) {
    try {
        // Convert the key to a valid format
        const keyBytes = CryptoJS.enc.Utf8.parse(key);
        const iv = CryptoJS.lib.WordArray.random(16);
        
        const encrypted = CryptoJS.AES.encrypt(message, keyBytes, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        
        return {
            content: encrypted.toString(),
            iv: CryptoJS.enc.Hex.stringify(iv)
        };
    } catch (error) {
        console.error('Encryption error:', error);
        throw error;
    }
}

/**
 * Decrypts a message using CryptoJS
 * @param {string} encryptedMessage - The encrypted message
 * @param {string} iv - The initialization vector
 * @param {string} key - The decryption key
 * @returns {string} The decrypted message
 */
function decryptMessage(encryptedMessage, iv, key) {
    try {
        // Convert the key to a valid format
        const keyBytes = CryptoJS.enc.Utf8.parse(key);
        const ivBytes = CryptoJS.enc.Hex.parse(iv);
        
        const decrypted = CryptoJS.AES.decrypt(encryptedMessage, keyBytes, {
            iv: ivBytes,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        console.error('Decryption error:', error);
        throw error;
    }
}

/**
 * Debounces a function
 * @param {Function} func - The function to debounce
 * @param {number} wait - The debounce delay in milliseconds
 * @returns {Function} The debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttles a function
 * @param {Function} func - The function to throttle
 * @param {number} limit - The throttle limit in milliseconds
 * @returns {Function} The throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

export { 
    generateUserColor, 
    escapeHtml, 
    formatTimestamp, 
    generateInitials,
    encryptMessage,
    decryptMessage,
    debounce,
    throttle
};
