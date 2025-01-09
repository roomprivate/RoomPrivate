"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptionBinary = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const logger_1 = require("./logger");
class EncryptionBinary {
    constructor() {
        this.encryptionProcess = null;
        this.startEncryptionProcess();
    }
    static getInstance() {
        if (!EncryptionBinary.instance) {
            EncryptionBinary.instance = new EncryptionBinary();
        }
        return EncryptionBinary.instance;
    }
    getBinaryPath() {
        const isWindows = os_1.default.platform() === 'win32';
        const binaryName = isWindows ? 'encryption.exe' : 'encryption';
        return path_1.default.join(process.cwd(), 'encryption', 'target', 'release', binaryName);
    }
    startEncryptionProcess() {
        const binaryPath = this.getBinaryPath();
        try {
            this.encryptionProcess = (0, child_process_1.spawn)(binaryPath, [], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            if (!this.encryptionProcess.stdout || !this.encryptionProcess.stderr || !this.encryptionProcess.stdin) {
                throw new Error('Failed to start encryption process');
            }
            this.encryptionProcess.stderr.on('data', (data) => {
                logger_1.logger.error('Encryption process error:', data.toString());
            });
            this.encryptionProcess.on('error', (error) => {
                logger_1.logger.error('Failed to start encryption process:', error);
                this.encryptionProcess = null;
            });
            this.encryptionProcess.on('exit', (code) => {
                logger_1.logger.error(`Encryption process exited with code ${code}`);
                this.encryptionProcess = null;
                // Restart the process
                setTimeout(() => this.startEncryptionProcess(), 1000);
            });
        }
        catch (error) {
            logger_1.logger.error('Error starting encryption process:', error);
            throw error;
        }
    }
    async sendCommand(request) {
        if (!this.encryptionProcess?.stdin || !this.encryptionProcess?.stdout) {
            this.startEncryptionProcess();
            if (!this.encryptionProcess?.stdin || !this.encryptionProcess?.stdout) {
                throw new Error('Failed to start encryption process');
            }
        }
        return new Promise((resolve, reject) => {
            let responseData = '';
            const responseHandler = (data) => {
                responseData += data.toString();
                const lines = responseData.split('\n');
                while (lines.length > 1) {
                    const line = lines.shift().trim();
                    if (line) {
                        try {
                            const response = JSON.parse(line);
                            if (response.type === 'error') {
                                reject(new Error(response.error));
                                return;
                            }
                            resolve(response);
                            return;
                        }
                        catch (error) {
                            reject(error);
                            return;
                        }
                    }
                }
                responseData = lines[0] || '';
            };
            this.encryptionProcess.stdout.once('data', responseHandler);
            try {
                this.encryptionProcess.stdin.write(JSON.stringify(request) + '\n');
            }
            catch (error) {
                this.encryptionProcess.stdout.removeListener('data', responseHandler);
                reject(error);
            }
        });
    }
}
exports.encryptionBinary = EncryptionBinary.getInstance();
