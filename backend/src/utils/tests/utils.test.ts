import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toBool } from '../to-bool.js';
import { toTitleCase } from '../ToTitlecase.js';
import { formatMinutesToHMS } from '../formatMinutesToHMS.js';
import { isValidObjectId } from '../isValidObjectId.js';
import { normalizeKeysToLower } from '../normalizeKeysToLower.js';
import { calculateHoursSince } from '../calculateHoursSince.js';

describe('toBool utility', () => {
  it('returns true when string is "true"', () => {
    expect(toBool('true')).toBe(true);
  });

  it('returns false for other strings', () => {
    expect(toBool('false')).toBe(false);
    expect(toBool('abc')).toBe(false);
    expect(toBool('')).toBe(false);
  });
});

describe('toTitleCase utility', () => {
  it('converts mixed case string to title case', () => {
    expect(toTitleCase('hello WORLD')).toBe('Hello World');
    expect(toTitleCase('  multiple   spaces  ')).toBe('Multiple Spaces');
  });

  it('handles null, undefined, or empty string gracefully', () => {
    expect(toTitleCase(null)).toBe('');
    expect(toTitleCase(undefined)).toBe('');
    expect(toTitleCase('')).toBe('');
  });
});

describe('formatMinutesToHMS utility', () => {
  it('correctly formats fractional minutes to hours, minutes, and seconds', () => {
    expect(formatMinutesToHMS(65.5)).toBe('1 hr, 5 min, 30 sec');
    expect(formatMinutesToHMS(0)).toBe('0 hr, 0 min, 0 sec');
    expect(formatMinutesToHMS(120)).toBe('2 hr, 0 min, 0 sec');
  });
});

describe('isValidObjectId utility', () => {
  it('returns true for valid 24-character hex strings', () => {
    expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
  });

  it('returns false for invalid strings', () => {
    expect(isValidObjectId('invalid-id')).toBe(false);
    expect(isValidObjectId('')).toBe(false);
  });
});

describe('normalizeKeysToLower utility', () => {
  it('recursively normalizes all keys in an object to lowercase', () => {
    const input = {
      FirstName: 'John',
      CONTACT: {
        EmailAddress: 'john@example.com',
        PhoneNumbers: [
          { Type: 'Home', Number: '123' },
          { Type: 'Work', Number: '456' }
        ]
      }
    };

    const expected = {
      firstname: 'John',
      contact: {
        emailaddress: 'john@example.com',
        phonenumbers: [
          { type: 'Home', number: '123' },
          { type: 'Work', number: '456' }
        ]
      }
    };

    expect(normalizeKeysToLower(input)).toEqual(expected);
  });

  it('returns non-object values directly', () => {
    expect(normalizeKeysToLower('string')).toBe('string');
    expect(normalizeKeysToLower(42)).toBe(42);
    expect(normalizeKeysToLower(null)).toBeNull();
  });
});

describe('calculateHoursSince utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates remaining SLA hours and minutes correctly', () => {
    // Set system time to 2026-07-19T10:00:00.000Z
    const mockNow = new Date('2026-07-19T10:00:00.000Z');
    vi.setSystemTime(mockNow);

    // Created 30 minutes ago (remaining: 1h 30m)
    const date30MinsAgo = new Date('2026-07-19T09:30:00.000Z');
    const result1 = calculateHoursSince(date30MinsAgo);
    expect(result1.remaining).toEqual({ hrs: 1, mins: 30 });
    expect(result1.remainingMs).toBe(1.5 * 60 * 60 * 1000);

    // Created 2.5 hours ago (expired SLA, remaining should be null)
    const date2AndHalfHoursAgo = new Date('2026-07-19T07:30:00.000Z');
    const result2 = calculateHoursSince(date2AndHalfHoursAgo);
    expect(result2.remaining).toBeNull();
    expect(result2.remainingMs).toBe(-0.5 * 60 * 60 * 1000);
  });
});
