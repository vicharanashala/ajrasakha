import {describe, it, expect} from 'vitest';
import {assertPasswordFitsBcrypt, assertStrongPassword} from './passwordPolicy.js';

describe('passwordPolicy', () => {
  it('accepts a password meeting every rule', () => {
    expect(() => assertStrongPassword('Str0ng!Passw0rd')).not.toThrow();
  });

  it.each([
    ['', 'Password is required'],
    ['        ', 'Password is required'],
    ['Sh0rt!', 'at least 8 characters'],
    ['nouppercase1!', 'uppercase letter'],
    ['NOLOWERCASE1!', 'lowercase letter'],
    ['NoNumbers!!', 'number'],
    ['NoSpecial123', 'special character'],
  ])('rejects %j', (password, message) => {
    expect(() => assertStrongPassword(password)).toThrow(message);
  });

  it('rejects passwords bcrypt would silently truncate (over 72 bytes)', () => {
    expect(() => assertPasswordFitsBcrypt('A'.repeat(72))).not.toThrow();
    expect(() => assertPasswordFitsBcrypt('A'.repeat(73))).toThrow('too long');
    // Multi-byte characters count by their UTF-8 size: 25 x 3 bytes = 75 bytes.
    expect(() => assertPasswordFitsBcrypt('प'.repeat(25))).toThrow('too long');
  });
});
