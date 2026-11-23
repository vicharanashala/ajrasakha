import { Request, Response, NextFunction } from 'express';
import { logger } from '#root/utils/logger.js';

export function loggingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;

  res.on('finish', () => {
    const status = res.statusCode;

    // Only log client warnings (4xx) and server errors (5xx) to maximize performance and minimize volume at 100 req/s
    if (status >= 400) {
      const durationMs = Date.now() - start;
      const isServerError = status >= 500;
      const logData = {
        message: `${method} ${url} failed with status ${status} (${durationMs}ms)`,
        method,
        url,
        statusCode: status,
        durationMs,
        ip: req.socket.remoteAddress || '-',
        callId: (req as any).callId || req.headers['x-call-id'],
      };

      if (isServerError) {
        logger.error(logData);
      } else {
        logger.warn(logData);
      }
    }
  });

  next();
}
