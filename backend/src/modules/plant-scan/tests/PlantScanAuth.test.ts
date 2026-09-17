import {afterEach, describe, expect, it, vi} from 'vitest';
import {InternalApiAuth} from '#root/shared/functions/internalApiAuth.js';

describe('Plant Scan authentication', () => {
  const originalInternalKey = process.env.INTERNAL_API_KEY;
  const originalReviewKey = process.env.REVIEW_SYSTEM_AUTH_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.INTERNAL_API_KEY = originalInternalKey;
    process.env.REVIEW_SYSTEM_AUTH_KEY = originalReviewKey;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('allows the Plant Scan request without a key in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_API_KEY = 'plant-scan-test-key';
    process.env.REVIEW_SYSTEM_AUTH_KEY = undefined;

    const next = vi.fn();

    new InternalApiAuth().use(
      {method: 'POST', path: '/api/plant-scan', headers: {}},
      {status: vi.fn(), json: vi.fn()},
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('allows the local default development environment without a key', () => {
    delete process.env.NODE_ENV;
    process.env.INTERNAL_API_KEY = 'plant-scan-test-key';
    process.env.REVIEW_SYSTEM_AUTH_KEY = undefined;

    const next = vi.fn();

    new InternalApiAuth().use(
      {method: 'POST', path: '/api/plant-scan', headers: {}},
      {status: vi.fn(), json: vi.fn()},
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('matches the full URL when routing-controllers exposes a local path', () => {
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_API_KEY = 'plant-scan-test-key';
    process.env.REVIEW_SYSTEM_AUTH_KEY = undefined;

    const next = vi.fn();

    new InternalApiAuth().use(
      {
        method: 'POST',
        path: '/plant-scan',
        originalUrl: '/api/plant-scan',
        headers: {},
      },
      {status: vi.fn(), json: vi.fn()},
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('matches the mounted API path when only baseUrl and path are available', () => {
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_API_KEY = 'plant-scan-test-key';
    process.env.REVIEW_SYSTEM_AUTH_KEY = undefined;

    const next = vi.fn();

    new InternalApiAuth().use(
      {
        method: 'POST',
        baseUrl: '/api',
        path: '/plant-scan',
        headers: {},
      },
      {status: vi.fn(), json: vi.fn()},
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects the Plant Scan request without a key outside development', () => {
    process.env.NODE_ENV = 'production';
    process.env.INTERNAL_API_KEY = 'plant-scan-test-key';
    process.env.REVIEW_SYSTEM_AUTH_KEY = undefined;

    const status = vi.fn().mockReturnThis();
    const setHeader = vi.fn();
    const json = vi.fn();
    const next = vi.fn();

    new InternalApiAuth().use(
      {method: 'POST', path: '/api/plant-scan', headers: {}},
      {status, setHeader, json},
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Unauthorized',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not allow the development exception on another endpoint', () => {
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_API_KEY = 'plant-scan-test-key';
    process.env.REVIEW_SYSTEM_AUTH_KEY = undefined;

    const status = vi.fn().mockReturnThis();
    const setHeader = vi.fn();
    const json = vi.fn();
    const next = vi.fn();

    new InternalApiAuth().use(
      {method: 'POST', path: '/api/other', headers: {}},
      {status, setHeader, json},
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts the configured internal credential', () => {
    process.env.NODE_ENV = 'production';
    process.env.INTERNAL_API_KEY = 'plant-scan-test-key';
    process.env.REVIEW_SYSTEM_AUTH_KEY = undefined;

    const next = vi.fn();

    new InternalApiAuth().use(
      {headers: {'x-internal-api-key': 'plant-scan-test-key'}},
      {status: vi.fn(), json: vi.fn()},
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });
});