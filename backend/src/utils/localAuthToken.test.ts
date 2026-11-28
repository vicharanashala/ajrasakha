import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('#root/config/app.js', () => ({
  appConfig: {
    enableFirebaseLogin: false,
    localAuth: {jwtSecret: 'test-secret-that-is-at-least-32-chars', tokenTtlSeconds: 60},
  },
}));

const {signLocalAuthToken, verifyLocalAuthToken} = await import('./localAuthToken.js');

describe('localAuthToken', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips the uid and email of a signed token', () => {
    const {token, expiresIn} = signLocalAuthToken('local_abc', 'user@test.com');
    const payload = verifyLocalAuthToken(token);
    expect(payload.uid).toBe('local_abc');
    expect(payload.email).toBe('user@test.com');
    expect(expiresIn).toBe(60);
  });

  it('rejects a token whose payload was tampered with', () => {
    const {token} = signLocalAuthToken('local_abc', 'user@test.com');
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({uid: 'local_admin', email: 'x', iat: 0, exp: 9999999999}),
    ).toString('base64url');
    expect(() => verifyLocalAuthToken(`${header}.${forgedPayload}.${signature}`)).toThrow(
      'Invalid token signature',
    );
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const {token} = signLocalAuthToken('local_abc', 'user@test.com');
    vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
    expect(() => verifyLocalAuthToken(token)).toThrow('Token expired');
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyLocalAuthToken('not-a-token')).toThrow('Malformed token');
  });
});
