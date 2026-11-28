import crypto from 'crypto';
import {describe, it, expect, vi, afterEach, beforeEach} from 'vitest';
import {appConfig} from '#root/config/app.js';
import {
  assertLocalAuthConfigured,
  signLocalAuthToken,
  verifyLocalAuthToken,
} from './localAuthToken.js';

const SECRET = 'test-only-local-auth-secret-0123456789-abcdef';

// Encodes a value as a base64url JSON segment.
const segment = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

// Signs arbitrary header/payload segments with a secret, to build tokens the issuer would never produce.
const signWith = (secret: string, header: string, payload: string) =>
  crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');

describe('localAuthToken', () => {
  beforeEach(() => {
    appConfig.enableFirebaseLogin = false;
    appConfig.localAuth.jwtSecret = SECRET;
    appConfig.localAuth.tokenTtlSeconds = 60;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips the uid and email of a signed token', () => {
    const {token, expiresIn} = signLocalAuthToken('local_abc', 'user@test.com');
    const payload = verifyLocalAuthToken(token);
    expect(payload.uid).toBe('local_abc');
    expect(payload.email).toBe('user@test.com');
    expect(payload.exp - payload.iat).toBe(60);
    expect(expiresIn).toBe(60);
  });

  it('rejects a token whose payload was changed to impersonate another user', () => {
    const {token} = signLocalAuthToken('local_abc', 'user@test.com');
    const [header, , signature] = token.split('.');
    const forgedPayload = segment({uid: 'local_admin', email: 'x', iat: 0, exp: 9999999999});
    expect(() => verifyLocalAuthToken(`${header}.${forgedPayload}.${signature}`)).toThrow(
      'Invalid token signature',
    );
  });

  it('rejects a token signed with a different secret', () => {
    const header = segment({alg: 'HS256', typ: 'JWT'});
    const now = Math.floor(Date.now() / 1000);
    const payload = segment({uid: 'local_admin', email: 'x', iat: now, exp: now + 60});
    const forged = `${header}.${payload}.${signWith('attacker-guessed-secret-000000000000', header, payload)}`;
    expect(() => verifyLocalAuthToken(forged)).toThrow('Invalid token signature');
  });

  it('rejects an unsigned "alg: none" token', () => {
    const header = segment({alg: 'none', typ: 'JWT'});
    const payload = segment({uid: 'local_admin', email: 'x', iat: 0, exp: 9999999999});
    expect(() => verifyLocalAuthToken(`${header}.${payload}.`)).toThrow('Malformed token');
  });

  it('rejects a valid signature reused under a different header', () => {
    const {token} = signLocalAuthToken('local_abc', 'user@test.com');
    const [, payload, signature] = token.split('.');
    const noneHeader = segment({alg: 'none', typ: 'JWT'});
    expect(() => verifyLocalAuthToken(`${noneHeader}.${payload}.${signature}`)).toThrow(
      'Invalid token signature',
    );
  });

  it('rejects a correctly signed token with a missing expiry', () => {
    const header = segment({alg: 'HS256', typ: 'JWT'});
    const payload = segment({uid: 'local_abc', email: 'x', iat: 0});
    expect(() =>
      verifyLocalAuthToken(`${header}.${payload}.${signWith(SECRET, header, payload)}`),
    ).toThrow('Invalid token payload');
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const {token} = signLocalAuthToken('local_abc', 'user@test.com');
    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'));
    expect(() => verifyLocalAuthToken(token)).toThrow('Token expired');
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyLocalAuthToken('not-a-token')).toThrow('Malformed token');
    expect(() => verifyLocalAuthToken('a.b.c.d')).toThrow('Malformed token');
    expect(() => verifyLocalAuthToken('')).toThrow('Malformed token');
  });

  it('refuses to sign or verify with a missing or short secret', () => {
    appConfig.localAuth.jwtSecret = 'too-short';
    expect(() => signLocalAuthToken('local_abc', 'user@test.com')).toThrow(
      'LOCAL_AUTH_JWT_SECRET',
    );
    appConfig.localAuth.jwtSecret = undefined;
    expect(() => verifyLocalAuthToken('a.b.c')).toThrow('LOCAL_AUTH_JWT_SECRET');
  });

  it('fails startup only when local login is enabled without a usable secret', () => {
    appConfig.localAuth.jwtSecret = undefined;
    expect(() => assertLocalAuthConfigured()).toThrow('LOCAL_AUTH_JWT_SECRET');

    appConfig.enableFirebaseLogin = true;
    expect(() => assertLocalAuthConfigured()).not.toThrow();
  });
});
