"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accessLoggerMiddleware = void 0;
const accessLogService_1 = require("../services/accessLogService");
const accessLoggerMiddleware = async (req, res, next) => {
    try {
        const userIp = req.ip || req.socket.remoteAddress || 'unknown';
        const userGeoLoc = req.headers['x-geo-location'] || 'unknown';
        const platform = req.headers['user-agent'] || 'unknown';
        const device = req.headers['x-device-info'] || 'unknown';
        await accessLogService_1.AccessLogService.logAccess({
            userIp,
            userGeoLoc,
            platform,
            device
        });
        next();
    }
    catch (error) {
        // Don't block the request if logging fails
        console.error('Error in access logger middleware:', error);
        next();
    }
};
exports.accessLoggerMiddleware = accessLoggerMiddleware;
