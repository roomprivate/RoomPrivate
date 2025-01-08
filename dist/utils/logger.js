"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const winston_2 = require("winston");
const path_1 = __importDefault(require("path"));
const { combine, timestamp, printf, colorize } = winston_2.format;
// Use Winston's TransformableInfo type
const customFormat = printf((info) => {
    const { level, message, timestamp, ...metadata } = info;
    let msg = `${timestamp || new Date().toISOString()} [${level}] ${String(message)}`;
    if (Object.keys(metadata).length > 0 && metadata.stack === undefined) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});
// Create logs directory if it doesn't exist
const logsDir = path_1.default.join(__dirname, '../../logs');
if (!require('fs').existsSync(logsDir)) {
    require('fs').mkdirSync(logsDir, { recursive: true });
}
exports.logger = winston_1.default.createLogger({
    level: 'info',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), colorize(), customFormat),
    transports: [
        new winston_1.default.transports.Console({
            level: 'debug'
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), customFormat)
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), customFormat)
        })
    ]
});
