import crypto from 'crypto';

interface DevUser {
  uid: string;
  email: string;
  passwordHash: string;
  displayName: string;
  emailVerified: boolean;
  disabled: boolean;
}

const users = new Map<string, DevUser>();
const emailIndex = new Map<string, DevUser>();

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateUid(): string {
  return 'dev-' + crypto.randomBytes(16).toString('hex');
}

function generateIdToken(user: DevUser): string {
  const payload = JSON.stringify({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    email_verified: user.emailVerified,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return Buffer.from(payload).toString('base64url');
}

export function verifyIdToken(token: string): any {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function devCreateUser(params: {
  email: string;
  password: string;
  displayName?: string;
  emailVerified?: boolean;
}): DevUser {
  const existing = emailIndex.get(params.email.toLowerCase());
  if (existing) {
    const err: any = new Error('The email address is already in use by another account.');
    err.code = 'auth/email-already-exists';
    throw err;
  }

  const uid = generateUid();
  const user: DevUser = {
    uid,
    email: params.email.toLowerCase(),
    passwordHash: hashPassword(params.password),
    displayName: params.displayName || params.email.split('@')[0],
    emailVerified: params.emailVerified ?? false,
    disabled: false,
  };

  users.set(uid, user);
  emailIndex.set(user.email, user);
  return user;
}

export function devGetUserByEmail(email: string): DevUser | null {
  return emailIndex.get(email.toLowerCase()) || null;
}

export function devGetUser(uid: string): DevUser | null {
  return users.get(uid) || null;
}

export function devUpdateUser(uid: string, updates: { password?: string; displayName?: string; emailVerified?: boolean }): DevUser {
  const user = users.get(uid);
  if (!user) {
    const err: any = new Error('No user record found.');
    err.code = 'auth/user-not-found';
    throw err;
  }
  if (updates.password !== undefined) user.passwordHash = hashPassword(updates.password);
  if (updates.displayName !== undefined) user.displayName = updates.displayName;
  if (updates.emailVerified !== undefined) user.emailVerified = updates.emailVerified;
  return user;
}

export function devDeleteUser(uid: string): void {
  const user = users.get(uid);
  if (user) {
    emailIndex.delete(user.email);
    users.delete(uid);
  }
}

export function devSignIn(email: string, password: string): { idToken: string; localId: string; email: string; displayName: string; emailVerified: boolean } {
  const user = emailIndex.get(email.toLowerCase());
  if (!user) {
    const err: any = new Error('EMAIL_NOT_FOUND');
    err.code = 'EMAIL_NOT_FOUND';
    throw err;
  }
  if (user.disabled) {
    const err: any = new Error('USER_DISABLED');
    err.code = 'USER_DISABLED';
    throw err;
  }
  if (user.passwordHash !== hashPassword(password)) {
    const err: any = new Error('INVALID_PASSWORD');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  const idToken = generateIdToken(user);
  return {
    idToken,
    localId: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
  };
}
