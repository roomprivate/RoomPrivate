import { PrismaClient, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { AccessLogEncryption } from '../utils/accessLogEncryption';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

interface AccessLogInput {
    userIp: string;
    userGeoLoc: string;
    platform: string;
    device: string;
}

interface EncryptedLogData {
    encryptedIp: string;
    encryptedGeoLoc: string;
    encryptedPlatform: string;
    encryptedDevice: string;
    encryptedTimestamp: string;
    publicKey: string;
    entropyMark: string;
}

const prisma = new PrismaClient();

export class AccessLogService {
    private static readonly RATE_LIMIT_WINDOW = 60 * 1000;
    private static readonly RATE_LIMIT_MAX = 5;
    private static readonly BATCH_SIZE = 10;
    private static readonly MAX_RETRIES = 3;
    private static readonly WORKERS_COUNT = 4;
    
    private static accessAttempts = new Map<string, number[]>();
    private static batchQueue: Array<{
        data: EncryptedLogData,
        resolve: () => void,
        reject: (error: Error) => void
    }> = [];
    private static batchTimeout: NodeJS.Timeout | null = null;
    private static workers: Worker[] = [];
    private static workerIndex = 0;

    static {
        if (isMainThread) {
            for (let i = 0; i < this.WORKERS_COUNT; i++) {
                const worker = new Worker(__filename, {
                    workerData: { AES_KEY: crypto.randomBytes(32), AES_IV: crypto.randomBytes(16) }
                });
                this.workers.push(worker);
            }
        }
    }

    private static getNextWorker(): Worker {
        this.workerIndex = (this.workerIndex + 1) % this.WORKERS_COUNT;
        return this.workers[this.workerIndex];
    }

    private static async processBatchWithRetry(values: EncryptedLogData[], retries = 0): Promise<void> {
        try {
            await prisma.$transaction(async (tx) => {
                const createPromises = values.map(value => 
                    tx.$executeRaw`
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
                    `
                );
                await Promise.all(createPromises);
            });
        } catch (error) {
            if (retries < this.MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
                return this.processBatchWithRetry(values, retries + 1);
            }
            throw error;
        }
    }

    private static async processBatch() {
        if (this.batchQueue.length === 0) return;

        const batch = this.batchQueue.splice(0, this.BATCH_SIZE);
        const values = batch.map(item => item.data);

        try {
            await this.processBatchWithRetry(values);
            batch.forEach(item => item.resolve());
        } catch (error) {
            batch.forEach(item => item.reject(error as Error));
        }
    }

    private static scheduleBatchProcessing() {
        if (this.batchTimeout) return;
        
        this.batchTimeout = setTimeout(() => {
            this.batchTimeout = null;
            void this.processBatch();
        }, 100);
    }

    private static async encryptFieldInWorker(value: string): Promise<{ encrypted: string, publicKey: string }> {
        return new Promise((resolve, reject) => {
            const worker = this.getNextWorker();
            worker.postMessage({ value });
            
            const handler = (result: { encrypted: string, publicKey: string }) => {
                worker.off('message', handler);
                resolve(result);
            };
            
            worker.on('message', handler);
            worker.on('error', reject);
        });
    }

    private static isRateLimited(ip: string): boolean {
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

    private static async cleanupOldAttempts(): Promise<void> {
        const now = Date.now();
        const promises: Promise<void>[] = [];

        for (const [ip, attempts] of this.accessAttempts.entries()) {
            promises.push((async () => {
                const recentAttempts = attempts.filter(time => now - time < this.RATE_LIMIT_WINDOW);
                if (recentAttempts.length === 0) {
                    this.accessAttempts.delete(ip);
                } else {
                    this.accessAttempts.set(ip, recentAttempts);
                }
            })());
        }

        await Promise.all(promises);
    }

    static async logAccess(data: AccessLogInput): Promise<void> {
        if (this.isRateLimited(data.userIp)) {
            return;
        }

        try {
            const [
                encryptedIp,
                encryptedGeoLoc,
                encryptedPlatform,
                encryptedDevice,
                encryptedTimestamp
            ] = await Promise.all([
                this.encryptFieldInWorker(data.userIp),
                this.encryptFieldInWorker(data.userGeoLoc),
                this.encryptFieldInWorker(data.platform),
                this.encryptFieldInWorker(data.device),
                this.encryptFieldInWorker(new Date().toISOString())
            ]);

            const entropyMarkBase64 = crypto.randomBytes(32).toString('base64');

            const logData: EncryptedLogData = {
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
                } else {
                    this.scheduleBatchProcessing();
                }
            });
        } catch (error) {
            throw new Error('Access logging failed');
        }
    }
}

if (!isMainThread) {
    const { AES_KEY, AES_IV } = workerData;

    parentPort?.on('message', async ({ value }) => {
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

            const { publicKey } = await AccessLogEncryption.encryptAccessLog({
                userIp: AES_KEY.toString('base64'),
                userGeoLoc: '',
                platform: '',
                device: '',
                timestamp: new Date()
            });

            parentPort?.postMessage({
                encrypted: combined,
                publicKey
            });
        } catch (error) {
            parentPort?.emit('error', error);
        }
    });
}
