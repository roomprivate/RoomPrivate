import { PrismaClient, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { join } from 'path';
import os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { encryptionBinary } from '../utils/encryptionBinary';
import * as fs from 'fs';

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

interface RustEncryptionProcess {
    process: ReturnType<typeof spawn>;
    busy: boolean;
}

const prisma = new PrismaClient();

export class AccessLogService {
    private static readonly RATE_LIMIT_WINDOW = 60 * 1000;
    private static readonly RATE_LIMIT_MAX = 5;
    private static readonly BATCH_SIZE = 10;
    private static readonly MAX_RETRIES = 3;
    private static readonly WORKERS_COUNT = 4;
    private static readonly LOG_RETENTION_DAYS = 180;
    private static readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
    
    private static accessAttempts = new Map<string, number[]>();
    private static batchQueue: Array<{
        data: EncryptedLogData,
        resolve: () => void,
        reject: (error: Error) => void
    }> = [];
    private static batchTimeout: NodeJS.Timeout | null = null;
    private static workers: RustEncryptionProcess[] = [];
    private static workerIndex = 0;
    private static cleanupInterval: NodeJS.Timeout | null = null;

    static {
        if (isMainThread) {
            // Start Rust encryption processes
            const isWindows = os.platform() === 'win32';
            const binaryName = isWindows ? 'encryption.exe' : 'encryption';
            const binaryPath = join(process.cwd(), 'encryption', 'target', 'release', binaryName);
            
            for (let i = 0; i < this.WORKERS_COUNT; i++) {
                const rustProcess = spawn(
                    binaryPath,
                    [],
                    { stdio: ['pipe', 'pipe', 'pipe'] }
                );
                
                this.workers.push({ process: rustProcess, busy: false });
                
                // Handle process exit
                rustProcess.on('exit', (code) => {
                    if (code !== 0) {
                        // Restart the process
                        const newProcess = spawn(
                            binaryPath,
                            [],
                            { stdio: ['pipe', 'pipe', 'pipe'] }
                        );
                        this.workers[i] = { process: newProcess, busy: false };
                    }
                });
            }
            
            this.startCleanupScheduler();
        }
    }

    private static getNextWorker(): RustEncryptionProcess {
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

    private static async encryptFieldInRust(value: string): Promise<{ encrypted: string, publicKey: string }> {
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
                    const line = lines.shift()!.trim();
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
                        } catch (error) {
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
            } catch (error) {
                worker.busy = false;
                reject(error);
            }
        });
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

    private static async cleanupOldLogs(): Promise<void> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.LOG_RETENTION_DAYS);
            
            await prisma.$transaction(async (tx) => {
                while (true) {
                    const result = await tx.$executeRaw`
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
                    
                    if (result === 0) break;
                }
            });
        } catch {
            // Silently fail cleanup - will retry next interval
        }
    }

    private static startCleanupScheduler() {
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

    private static async encryptLogEntry(data: AccessLogInput | { userId: string, roomId: string, action: string, timestamp: string }): Promise<string> {
        try {
            const response = await encryptionBinary.sendCommand({
                type: 'encrypt',
                value: JSON.stringify(data),
                aes_key: crypto.randomBytes(32).toString('base64'),
                aes_iv: crypto.randomBytes(12).toString('base64')
            });
            return response.encrypted;
        } catch (error) {
            console.error('Failed to encrypt log entry:', error);
            throw new Error(`Failed to encrypt log entry: ${error}`);
        }
    }

    static async logAccess(dataOrUserId: AccessLogInput | string, roomId?: string, action?: string): Promise<void> {
        try {
            let data: AccessLogInput | { userId: string, roomId: string, action: string, timestamp: string };
            
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
            } else {
                if (this.isRateLimited(dataOrUserId.userIp)) {
                    return;
                }
                data = dataOrUserId;
            }

            const encryptedData = await this.encryptLogEntry(data);
            await fs.promises.appendFile('access.log', encryptedData + '\n');
        } catch (error) {
            console.error('Failed to log access:', error);
            throw new Error(`Failed to log access: ${error}`);
        }
    }
}
