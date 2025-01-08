import winston from 'winston';
import { format } from 'winston';
import path from 'path';

const { combine, timestamp, printf, colorize } = format;

// Use Winston's TransformableInfo type
const customFormat = printf((info: winston.Logform.TransformableInfo) => {
    const { level, message, timestamp, ...metadata } = info;
    let msg = `${timestamp || new Date().toISOString()} [${level}] ${String(message)}`;
    
    if (Object.keys(metadata).length > 0 && metadata.stack === undefined) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
});

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!require('fs').existsSync(logsDir)) {
    require('fs').mkdirSync(logsDir, { recursive: true });
}

export const logger = winston.createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        colorize(),
        customFormat
    ),
    transports: [
        new winston.transports.Console({
            level: 'debug'
        }),
        new winston.transports.File({ 
            filename: path.join(logsDir, 'error.log'), 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), customFormat)
        }),
        new winston.transports.File({ 
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), customFormat)
        })
    ]
});
