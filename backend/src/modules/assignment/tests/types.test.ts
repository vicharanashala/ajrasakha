import { describe, it, expect } from 'vitest';
import {
  toAssignmentPriority,
  isHigherOrEqualPriority,
  isHigherPriority,
  PRIORITY_ORDER,
} from '../types.js';
import { IQuestionPriority } from '#root/shared/interfaces/models.js';

describe('AssignmentPriority utilities', () => {
  describe('toAssignmentPriority', () => {
    it('maps low to low', () => {
      expect(toAssignmentPriority('low')).toBe('low');
    });

    it('maps medium to medium', () => {
      expect(toAssignmentPriority('medium')).toBe('medium');
    });

    it('maps high to high', () => {
      expect(toAssignmentPriority('high')).toBe('high');
    });

    it('maps critical to high', () => {
      expect(toAssignmentPriority('critical')).toBe('high');
    });
  });

  describe('PRIORITY_ORDER', () => {
    it('high has lowest number (highest priority)', () => {
      expect(PRIORITY_ORDER.high).toBe(0);
    });

    it('medium is in the middle', () => {
      expect(PRIORITY_ORDER.medium).toBe(1);
    });

    it('low has highest number (lowest priority)', () => {
      expect(PRIORITY_ORDER.low).toBe(2);
    });
  });

  describe('isHigherOrEqualPriority', () => {
    it('high is higher or equal to high', () => {
      expect(isHigherOrEqualPriority('high', 'high')).toBe(true);
    });

    it('high is higher or equal to medium', () => {
      expect(isHigherOrEqualPriority('high', 'medium')).toBe(true);
    });

    it('high is higher or equal to low', () => {
      expect(isHigherOrEqualPriority('high', 'low')).toBe(true);
    });

    it('medium is NOT higher or equal to high', () => {
      expect(isHigherOrEqualPriority('medium', 'high')).toBe(false);
    });

    it('medium is higher or equal to medium', () => {
      expect(isHigherOrEqualPriority('medium', 'medium')).toBe(true);
    });

    it('low is NOT higher or equal to high', () => {
      expect(isHigherOrEqualPriority('low', 'high')).toBe(false);
    });
  });

  describe('isHigherPriority', () => {
    it('high is strictly higher than medium', () => {
      expect(isHigherPriority('high', 'medium')).toBe(true);
    });

    it('high is strictly higher than low', () => {
      expect(isHigherPriority('high', 'low')).toBe(true);
    });

    it('high is NOT strictly higher than high', () => {
      expect(isHigherPriority('high', 'high')).toBe(false);
    });

    it('medium is strictly higher than low', () => {
      expect(isHigherPriority('medium', 'low')).toBe(true);
    });

    it('medium is NOT strictly higher than high', () => {
      expect(isHigherPriority('medium', 'high')).toBe(false);
    });
  });
});