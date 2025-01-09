import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import { logger } from './logger';

class EncryptionBinary {
    private static instance: EncryptionBinary;
    private encryptionProcess: ChildProcess | null = null;

    private constructor() {
        this.startEncryptionProcess();
    }

    public static getInstance(): EncryptionBinary {
        if (!EncryptionBinary.instance) {
            EncryptionBinary.instance = new EncryptionBinary();
        }
        return EncryptionBinary.instance;
    }

    private getBinaryPath(): string {
        const isWindows = os.platform() === 'win32';
        const binaryName = isWindows ? 'encryption.exe' : 'encryption';
        return path.join(process.cwd(), 'encryption', 'target', 'release', binaryName);
    }

    private startEncryptionProcess() {
        const binaryPath = this.getBinaryPath();
        
        try {
            this.encryptionProcess = spawn(binaryPath, [], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            if (!this.encryptionProcess.stdout || !this.encryptionProcess.stderr || !this.encryptionProcess.stdin) {
                throw new Error('Failed to start encryption process');
            }

            this.encryptionProcess.stderr.on('data', (data) => {
                logger.error('Encryption process error:', data.toString());
            });

            this.encryptionProcess.on('error', (error) => {
                logger.error('Failed to start encryption process:', error);
                this.encryptionProcess = null;
            });

            this.encryptionProcess.on('exit', (code) => {
                logger.error(`Encryption process exited with code ${code}`);
                this.encryptionProcess = null;
                // Restart the process
                setTimeout(() => this.startEncryptionProcess(), 1000);
            });

        } catch (error) {
            logger.error('Error starting encryption process:', error);
            throw error;
        }
    }

    public async sendCommand(request: any): Promise<any> {
        if (!this.encryptionProcess?.stdin || !this.encryptionProcess?.stdout) {
            this.startEncryptionProcess();
            if (!this.encryptionProcess?.stdin || !this.encryptionProcess?.stdout) {
                throw new Error('Failed to start encryption process');
            }
        }

        return new Promise((resolve, reject) => {
            let responseData = '';

            const responseHandler = (data: Buffer) => {
                responseData += data.toString();
                const lines = responseData.split('\n');
                
                while (lines.length > 1) {
                    const line = lines.shift()!.trim();
                    if (line) {
                        try {
                            const response = JSON.parse(line);
                            if (response.type === 'error') {
                                reject(new Error(response.error));
                                return;
                            }
                            resolve(response);
                            return;
                        } catch (error) {
                            reject(error);
                            return;
                        }
                    }
                }
                responseData = lines[0] || '';
            };

            this.encryptionProcess!.stdout!.once('data', responseHandler);

            try {
                this.encryptionProcess!.stdin!.write(JSON.stringify(request) + '\n');
            } catch (error) {
                this.encryptionProcess!.stdout!.removeListener('data', responseHandler);
                reject(error);
            }
        });
    }
}

export const encryptionBinary = EncryptionBinary.getInstance();
