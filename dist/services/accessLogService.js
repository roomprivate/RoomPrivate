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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessLogService = void 0;
const client_1 = require("@prisma/client");
const crypto = __importStar(require("crypto"));
const child_process_1 = require("child_process");
const path_1 = require("path");
const os_1 = __importDefault(require("os"));
const worker_threads_1 = require("worker_threads");
const encryptionBinary_1 = require("../utils/encryptionBinary");
const fs = __importStar(require("fs"));
const prisma = new client_1.PrismaClient();
class AccessLogService {
    static getNextWorker() {
        // Find first non-busy worker
        let worker = this.workers.find(w => !w.busy);
        if (!worker) {
            // If all workers are busy, use round-robin
            this.workerIndex = (this.workerIndex + 1) % this.WORKERS_COUNT;
            worker = this.workers[this.workerIndex];
        }
        worker.busy = true;
        return worker;
    }
    static async encryptFieldInRust(value) {
        return new Promise((resolve, reject) => {
            const worker = this.getNextWorker();
            const { process } = worker;
            if (!process.stdout || !process.stderr || !process.stdin) {
                worker.busy = false;
                console.error('Process streams not available');
                reject(new Error('Process streams not available'));
                return;
            }
            const aesKey = crypto.randomBytes(32);
            const aesIv = crypto.randomBytes(12);
            const request = {
                type: 'encrypt',
                value,
                aes_key: aesKey.toString('base64'),
                aes_iv: aesIv.toString('base64')
            };
            let responseData = '';
            process.stdout.on('data', (data) => {
                responseData += data.toString();
                const lines = responseData.split('\n');
                // Process all complete lines
                while (lines.length > 1) {
                    const line = lines.shift().trim();
                    if (line) {
                        try {
                            const result = JSON.parse(line);
                            if (result.type === 'error') {
                                console.error('Encryption service error:', result.error);
                                reject(new Error(`Encryption failed: ${result.error}`));
                                return;
                            }
                            if (result.type !== 'encrypt' || !result.encrypted || !result.public_key) {
                                console.error('Invalid response from encryption service:', result);
                                reject(new Error('Invalid response from encryption service'));
                                return;
                            }
                            worker.busy = false;
                            resolve({
                                encrypted: result.encrypted,
                                publicKey: result.public_key
                            });
                            return;
                        }
                        catch (error) {
                            console.error('Failed to parse encryption service response:', error);
                            reject(new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
                            return;
                        }
                    }
                }
                // Keep the last incomplete line
                responseData = lines[0] || '';
            });
            process.stderr?.on('data', (data) => {
                console.error('Encryption process error:', data.toString());
                reject(new Error(`Encryption process error: ${data.toString()}`));
            });
            try {
                process.stdin.write(JSON.stringify(request) + '\n');
            }
            catch (error) {
                worker.busy = false;
                reject(error);
            }
        });
    }
    static async processBatchWithRetry(values, retries = 0) {
        try {
            await prisma.$transaction(async (tx) => {
                const createPromises = values.map(value => tx.$executeRaw `
                        INSERT INTO "AccessLog" (
                            id,
                            "encryptedIp",
                            "encryptedGeoLoc",
                            "encryptedPlatform",
                            "encryptedDevice",
                            "encryptedTimestamp",
                            "publicKey",
                            "entropyMark"
                        ) VALUES (
                            gen_random_uuid(),
                            ${value.encryptedIp},
                            ${value.encryptedGeoLoc},
                            ${value.encryptedPlatform},
                            ${value.encryptedDevice},
                            ${value.encryptedTimestamp},
                            ${value.publicKey},
                            ${value.entropyMark}
                        )
                    `);
                await Promise.all(createPromises);
            });
        }
        catch (error) {
            if (retries < this.MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
                return this.processBatchWithRetry(values, retries + 1);
            }
            throw error;
        }
    }
    static async processBatch() {
        if (this.batchQueue.length === 0)
            return;
        const batch = this.batchQueue.splice(0, this.BATCH_SIZE);
        const values = batch.map(item => item.data);
        try {
            await this.processBatchWithRetry(values);
            batch.forEach(item => item.resolve());
        }
        catch (error) {
            batch.forEach(item => item.reject(error));
        }
    }
    static scheduleBatchProcessing() {
        if (this.batchTimeout)
            return;
        this.batchTimeout = setTimeout(() => {
            this.batchTimeout = null;
            void this.processBatch();
        }, 100);
    }
    static isRateLimited(ip) {
        const now = Date.now();
        const attempts = this.accessAttempts.get(ip) || [];
        const recentAttempts = attempts.filter(time => now - time < this.RATE_LIMIT_WINDOW);
        if (recentAttempts.length >= this.RATE_LIMIT_MAX) {
            return true;
        }
        recentAttempts.push(now);
        this.accessAttempts.set(ip, recentAttempts);
        if (Math.random() < 0.01) {
            void this.cleanupOldAttempts();
        }
        return false;
    }
    static async cleanupOldAttempts() {
        const now = Date.now();
        const promises = [];
        for (const [ip, attempts] of this.accessAttempts.entries()) {
            promises.push((async () => {
                const recentAttempts = attempts.filter(time => now - time < this.RATE_LIMIT_WINDOW);
                if (recentAttempts.length === 0) {
                    this.accessAttempts.delete(ip);
                }
                else {
                    this.accessAttempts.set(ip, recentAttempts);
                }
            })());
        }
        await Promise.all(promises);
    }
    static async cleanupOldLogs() {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.LOG_RETENTION_DAYS);
            await prisma.$transaction(async (tx) => {
                while (true) {
                    const result = await tx.$executeRaw `
                        WITH deleted AS (
                            SELECT id FROM "AccessLog"
                            WHERE "encryptedTimestamp" < ${cutoffDate.toISOString()}
                            LIMIT 1000
                            FOR UPDATE SKIP LOCKED
                        )
                        DELETE FROM "AccessLog"
                        WHERE id IN (SELECT id FROM deleted)
                        RETURNING id
                    `;
                    if (result === 0)
                        break;
                }
            });
        }
        catch {
            // Silently fail cleanup - will retry next interval
        }
    }
    static startCleanupScheduler() {
        void this.cleanupOldLogs();
        this.cleanupInterval = setInterval(() => {
            void this.cleanupOldLogs();
        }, this.CLEANUP_INTERVAL);
        process.on('beforeExit', () => {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
            }
        });
    }
    static async encryptLogEntry(data) {
        try {
            const response = await encryptionBinary_1.encryptionBinary.sendCommand({
                type: 'encrypt',
                value: JSON.stringify(data),
                aes_key: crypto.randomBytes(32).toString('base64'),
                aes_iv: crypto.randomBytes(12).toString('base64')
            });
            return response.encrypted;
        }
        catch (error) {
            console.error('Failed to encrypt log entry:', error);
            throw new Error(`Failed to encrypt log entry: ${error}`);
        }
    }
    static async logAccess(dataOrUserId, roomId, action) {
        try {
            let data;
            if (typeof dataOrUserId === 'string') {
                if (!roomId || !action) {
                    throw new Error('roomId and action are required when passing userId');
                }
                data = {
                    userId: dataOrUserId,
                    roomId,
                    action,
                    timestamp: new Date().toISOString()
                };
            }
            else {
                if (this.isRateLimited(dataOrUserId.userIp)) {
                    return;
                }
                data = dataOrUserId;
            }
            const encryptedData = await this.encryptLogEntry(data);
            await fs.promises.appendFile('access.log', encryptedData + '\n');
        }
        catch (error) {
            console.error('Failed to log access:', error);
            throw new Error(`Failed to log access: ${error}`);
        }
    }
}
exports.AccessLogService = AccessLogService;
_a = AccessLogService;
AccessLogService.RATE_LIMIT_WINDOW = 60 * 1000;
AccessLogService.RATE_LIMIT_MAX = 5;
AccessLogService.BATCH_SIZE = 10;
AccessLogService.MAX_RETRIES = 3;
AccessLogService.WORKERS_COUNT = 4;
AccessLogService.LOG_RETENTION_DAYS = 180;
AccessLogService.CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
AccessLogService.accessAttempts = new Map();
AccessLogService.batchQueue = [];
AccessLogService.batchTimeout = null;
AccessLogService.workers = [];
AccessLogService.workerIndex = 0;
AccessLogService.cleanupInterval = null;
(() => {
    if (worker_threads_1.isMainThread) {
        // Start Rust encryption processes
        const isWindows = os_1.default.platform() === 'win32';
        const binaryName = isWindows ? 'encryption.exe' : 'encryption';
        const binaryPath = (0, path_1.join)(process.cwd(), 'encryption', 'target', 'release', binaryName);
        for (let i = 0; i < _a.WORKERS_COUNT; i++) {
            const rustProcess = (0, child_process_1.spawn)(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
            _a.workers.push({ process: rustProcess, busy: false });
            // Handle process exit
            rustProcess.on('exit', (code) => {
                if (code !== 0) {
                    // Restart the process
                    const newProcess = (0, child_process_1.spawn)(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
                    _a.workers[i] = { process: newProcess, busy: false };
                }
            });
        }
        _a.startCleanupScheduler();
    }
})();
