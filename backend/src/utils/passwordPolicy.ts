import {BadRequestError} from 'routing-controllers';

// bcrypt only uses the first 72 bytes of a password; anything longer would be silently ignored.
const BCRYPT_MAX_PASSWORD_BYTES = 72;

// Enforces the platform password policy: 8+ characters with upper and lower case, a number and a special character.
export function assertStrongPassword(password?: string): void {
  if (!password || !password.trim()) {
    throw new BadRequestError('Password is required');
  }
  if (password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestError(
      'Password must contain at least one uppercase letter',
    );
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestError(
      'Password must contain at least one lowercase letter',
    );
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestError('Password must contain at least one number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new BadRequestError(
      'Password must contain at least one special character',
    );
  }
}

// Rejects passwords bcrypt would truncate, so every character the user typed is part of the hash.
export function assertPasswordFitsBcrypt(password: string): void {
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
    throw new BadRequestError(
      `Password is too long (maximum ${BCRYPT_MAX_PASSWORD_BYTES} characters)`,
    );
  }
}
