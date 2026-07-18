import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import os from 'os';

/**
 * Trust the first proxy hop (Nginx) so that req.ip reflects the real
 * client IP, not the load-balancer. Required for accurate rate-limiting.
 */
export function trustProxy(app: import('express').Express): void {
  app.set('trust proxy', 1);
}

/**
 * Per-IP general API rate limit — protects against brute force + scraping.
 * 120 requests/min per IP (with burst tolerance of 60).
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path === '/healthz' || req.path === '/readyz',
  message: {
    error: 'Too many requests, please try again in a moment.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Stricter limiter for authentication endpoints — 20 attempts per 15 min per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many authentication attempts, please wait 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Global safety headers — defence in depth on top of Nginx.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  next();
}

/**
 * Abort requests that exceed the configured client payload limit gracefully.
 */
export function payloadTooLargeHandler(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err && err.type === 'entity.too.large') {
    res.status(413).json({
      error: 'Payload too large',
      code: 'PAYLOAD_TOO_LARGE',
      limit: err.limit,
    });
    return;
  }
  next(err);
}

/**
 * Per-instance request id — useful for tracing through logs.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers['x-request-id'];
  const id =
    (typeof existing === 'string' && existing) ||
    (Array.isArray(existing) && existing[0]) ||
    `${Date.now().toString(36)}-${os.hostname().split('.')[0]}-${Math.random().toString(36).slice(2, 10)}`;
  res.setHeader('X-Request-Id', id);
  (req as any).id = id;
  next();
}

/**
 * Graceful shutdown support — call from SIGTERM/SIGINT handlers.
 */
export function gracefulShutdown(server: import('http').Server, timeoutMs = 25_000): void {
  const shutdown = (signal: string) => {
    console.log(`[${signal}] received — shutting down gracefully`);
    server.close((err) => {
      if (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
      process.exit(0);
    });

    // Hard kill after timeout
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, timeoutMs).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}