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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessLogService = void 0;
const client_1 = require("@prisma/client");
const crypto = __importStar(require("crypto"));
const accessLogEncryption_1 = require("../utils/accessLogEncryption");
const worker_threads_1 = require("worker_threads");
const prisma = new client_1.PrismaClient();
class AccessLogService {
    static getNextWorker() {
        this.workerIndex = (this.workerIndex + 1) % this.WORKERS_COUNT;
        return this.workers[this.workerIndex];
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
    static async encryptFieldInWorker(value) {
        return new Promise((resolve, reject) => {
            const worker = this.getNextWorker();
            worker.postMessage({ value });
            const handler = (result) => {
                worker.off('message', handler);
                resolve(result);
            };
            worker.on('message', handler);
            worker.on('error', reject);
        });
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
    static async logAccess(data) {
        if (this.isRateLimited(data.userIp)) {
            return;
        }
        try {
            const [encryptedIp, encryptedGeoLoc, encryptedPlatform, encryptedDevice, encryptedTimestamp] = await Promise.all([
                this.encryptFieldInWorker(data.userIp),
                this.encryptFieldInWorker(data.userGeoLoc),
                this.encryptFieldInWorker(data.platform),
                this.encryptFieldInWorker(data.device),
                this.encryptFieldInWorker(new Date().toISOString())
            ]);
            const entropyMarkBase64 = crypto.randomBytes(32).toString('base64');
            const logData = {
                encryptedIp: encryptedIp.encrypted,
                encryptedGeoLoc: encryptedGeoLoc.encrypted,
                encryptedPlatform: encryptedPlatform.encrypted,
                encryptedDevice: encryptedDevice.encrypted,
                encryptedTimestamp: encryptedTimestamp.encrypted,
                publicKey: encryptedIp.publicKey,
                entropyMark: entropyMarkBase64
            };
            return new Promise((resolve, reject) => {
                this.batchQueue.push({ data: logData, resolve, reject });
                if (this.batchQueue.length >= this.BATCH_SIZE) {
                    void this.processBatch();
                }
                else {
                    this.scheduleBatchProcessing();
                }
            });
        }
        catch (error) {
            throw new Error('Access logging failed');
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
AccessLogService.accessAttempts = new Map();
AccessLogService.batchQueue = [];
AccessLogService.batchTimeout = null;
AccessLogService.workers = [];
AccessLogService.workerIndex = 0;
(() => {
    if (worker_threads_1.isMainThread) {
        for (let i = 0; i < _a.WORKERS_COUNT; i++) {
            const worker = new worker_threads_1.Worker(__filename, {
                workerData: { AES_KEY: crypto.randomBytes(32), AES_IV: crypto.randomBytes(16) }
            });
            _a.workers.push(worker);
        }
    }
})();
if (!worker_threads_1.isMainThread) {
    const { AES_KEY, AES_IV } = worker_threads_1.workerData;
    worker_threads_1.parentPort?.on('message', async ({ value }) => {
        try {
            const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, AES_IV);
            let encrypted = cipher.update(value, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag();
            const combined = Buffer.concat([
                AES_IV,
                Buffer.from(encrypted, 'base64'),
                authTag
            ]).toString('base64');
            const { publicKey } = await accessLogEncryption_1.AccessLogEncryption.encryptAccessLog({
                userIp: AES_KEY.toString('base64'),
                userGeoLoc: '',
                platform: '',
                device: '',
                timestamp: new Date()
            });
            worker_threads_1.parentPort?.postMessage({
                encrypted: combined,
                publicKey
            });
        }
        catch (error) {
            worker_threads_1.parentPort?.emit('error', error);
        }
    });
}
