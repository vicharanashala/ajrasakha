import rateLimit from 'express-rate-limit';
import {Request, Response, NextFunction} from 'express';
import {appConfig} from '#root/config/app.js';

export const rateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 5, // Limit each IP to 5 requests per window
  standardHeaders: true, // Use `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {error: 'Too many requests, please try again later.'},
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Max 5 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

export function AuthRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (process.env.NODE_ENV === 'production') {
    return authRateLimiter(req, res, next); // delegate to express-rate-limit
  } else {
    next();
  }
}

const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS_PER_EMAIL = 10;

// Normalises the submitted email so case or whitespace changes cannot bypass the per-account limit.
function failedLoginKey(req: Request): string {
  const email = req.body?.email;
  return `local-login:${typeof email === 'string' ? email.trim().toLowerCase() : ''}`;
}

/**
 * Counts only failed attempts, per email, so one account cannot be brute-forced from many IPs.
 * Keyed by email rather than IP because the API runs behind a proxy without `trust proxy`,
 * where req.ip is the same for every client. The memory store is per instance.
 */
export const failedLocalLoginLimiter = rateLimit({
  windowMs: FAILED_LOGIN_WINDOW_MS,
  limit: MAX_FAILED_LOGINS_PER_EMAIL,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: failedLoginKey,
  message: {message: 'Too many failed login attempts. Please try again in 15 minutes.'},
  // The key does not use the client IP, so the proxy header check does not apply.
  validate: {xForwardedForHeader: false},
});

// Brute-force protection for MongoDB email/password login; Firebase has its own when it is enabled.
export function LocalLoginRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (appConfig.enableFirebaseLogin) {
    return next();
  }
  return failedLocalLoginLimiter(req, res, next);
}
