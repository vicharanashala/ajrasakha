import crypto from 'crypto';
import {appConfig} from '#root/config/app.js';

export interface LocalAuthTokenPayload {
  uid: string;
  email: string;
  iat: number;
  exp: number;
}

const MIN_SECRET_LENGTH = 32;
const TOKEN_HEADER = Buffer.from(
  JSON.stringify({alg: 'HS256', typ: 'JWT'}),
).toString('base64url');

// Returns the signing secret and fails fast when local login is misconfigured.
function getSigningSecret(): string {
  const secret = appConfig.localAuth.jwtSecret;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `LOCAL_AUTH_JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters when ENABLE_FIREBASE_LOGIN is false.`,
    );
  }
  return secret;
}

// Validates local login configuration at startup so a missing secret is not discovered at first login.
export function assertLocalAuthConfigured(): void {
  if (!appConfig.enableFirebaseLogin) {
    getSigningSecret();
  }
}

// Computes the HMAC SHA-256 signature for the token header and payload.
function createSignature(data: string): string {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(data)
    .digest('base64url');
}

// Issues a signed HS256 JWT for a user authenticated against MongoDB.
export function signLocalAuthToken(
  uid: string,
  email: string,
): {token: string; expiresIn: number} {
  const expiresIn = appConfig.localAuth.tokenTtlSeconds;
  const iat = Math.floor(Date.now() / 1000);
  const payload: LocalAuthTokenPayload = {uid, email, iat, exp: iat + expiresIn};
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signature = createSignature(`${TOKEN_HEADER}.${encodedPayload}`);
  return {token: `${TOKEN_HEADER}.${encodedPayload}.${signature}`, expiresIn};
}

// Verifies the signature and expiry of a local token and returns its payload.
export function verifyLocalAuthToken(token: string): LocalAuthTokenPayload {
  const [header, encodedPayload, signature, ...rest] = token.split('.');
  if (!header || !encodedPayload || !signature || rest.length > 0) {
    throw new Error('Malformed token');
  }

  const expected = Buffer.from(createSignature(`${header}.${encodedPayload}`));
  const actual = Buffer.from(signature);
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, 'base64url').toString('utf8'),
  ) as Partial<LocalAuthTokenPayload>;
  if (
    typeof payload.uid !== 'string' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('Invalid token payload');
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload as LocalAuthTokenPayload;
}
