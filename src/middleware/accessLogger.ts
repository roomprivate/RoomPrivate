import { Request, Response, NextFunction } from 'express';
import { AccessLogService } from '../services/accessLogService';

export const accessLoggerMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userIp = req.ip || req.socket.remoteAddress || 'unknown';
        const userGeoLoc = req.headers['x-geo-location'] as string || 'unknown';
        const platform = req.headers['user-agent'] || 'unknown';
        const device = req.headers['x-device-info'] as string || 'unknown';

        await AccessLogService.logAccess({
            userIp,
            userGeoLoc,
            platform,
            device
        });

        next();
    } catch (error) {
        // Don't block the request if logging fails
        console.error('Error in access logger middleware:', error);
        next();
    }
};
