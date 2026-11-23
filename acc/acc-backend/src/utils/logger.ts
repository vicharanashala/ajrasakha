import { createLogger, format, transports } from 'winston';

const isProductionOrStaging =
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

// GCP-recognized severity mapping
const gcpSeverityFormat = format(info => {
  const level = (info.level || 'info').toLowerCase();
  switch (level) {
    case 'error':
      info.severity = 'ERROR';
      break;
    case 'warn':
      info.severity = 'WARNING';
      break;
    case 'info':
      info.severity = 'INFO';
      break;
    case 'debug':
      info.severity = 'DEBUG';
      break;
    default:
      info.severity = 'DEFAULT';
  }
  return info;
});

/**
 * Standard phone number masking for compliance and privacy.
 * Preserves the last 3 digits, masking the rest (e.g. +919876543210 -> *********210).
 */
export function maskPhone(phoneStr?: string): string {
  if (!phoneStr) return '';
  const str = String(phoneStr).trim();
  const digitsOnly = str.replace(/\D/g, '');
  if (digitsOnly.length <= 3) return '***';
  const last3 = digitsOnly.slice(-3);
  return '*'.repeat(digitsOnly.length - 3) + last3;
}

// PII, Secret Redaction & Axios Circular Error Sanitizer
const sanitizeFormat = format(info => {
  // Redact secrets in info.body
  if (info.body && typeof info.body === 'object') {
    const sanitized: Record<string, any> = { ...info.body };
    const sensitiveKeys = ['password', 'token', 'authorization', 'privatekey', 'clientemail', 'secret'];
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    info.body = sanitized;
  }

  // Redact sensitive keys and mask phone numbers in root info properties
  const sensitiveKeys = ['password', 'token', 'authorization', 'privatekey', 'clientemail', 'secret'];
  const phoneKeys = ['phone', 'phonenumber', 'callernumber', 'farmerphone', 'destination'];

  for (const key of Object.keys(info)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      info[key] = '[REDACTED]';
    } else if (phoneKeys.some(p => lowerKey.includes(p)) && typeof info[key] === 'string') {
      info[key] = maskPhone(info[key]);
    }
  }

  // Sanitize Axios circular error objects (strips SocksProxyAgent, sockets, parsers)
  const config = (info as any).config;
  const request = (info as any).request;
  const response = (info as any).response;

  if (info.isAxiosError || config || request) {
    if (config) {
      info.url = config.url;
      info.method = config.method;
      delete (info as any).config;
    }
    if (request) {
      delete (info as any).request;
    }
    if (response) {
      info.statusCode = response.status;
      info.responseData = response.data;
      delete (info as any).response;
    }
  }

  return info;
});

export const logger = createLogger({
  level: isProductionOrStaging ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    gcpSeverityFormat(),
    sanitizeFormat(),
    isProductionOrStaging
      ? format.json() // Clean single-line JSON for Google Cloud Logging
      : format.combine(format.colorize(), format.simple())
  ),
  transports: [
    // Output directly to stdout - 0 MB disk usage on Cloud Run
    new transports.Console(),
    ...(isProductionOrStaging
      ? []
      : [new transports.File({ filename: 'error.log', level: 'error' })]),
  ],
});
