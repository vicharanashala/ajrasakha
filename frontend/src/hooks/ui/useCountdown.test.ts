import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeRemainingMs, buildHoldCountdownOptions } from "./useCountdown";

describe("SLA Countdown Timer Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("computeRemainingMs", () => {
    it("should calculate correct remaining time for normal 2-hour SLA", () => {
      const now = new Date("2026-08-25T10:00:00Z");
      vi.setSystemTime(now);

      // Question created 30 mins ago. Remaining: 1.5 hours (5400000 ms)
      const createdAt = new Date("2026-08-25T09:30:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 0;
      const holdAt = null;

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(1.5 * 60 * 60 * 1000);
    });

    it("should calculate 0 remaining time at the exact deadline", () => {
      const now = new Date("2026-08-25T12:00:00Z");
      vi.setSystemTime(now);

      // Question created 2 hours ago. Remaining: 0 ms
      const createdAt = new Date("2026-08-25T10:00:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 0;
      const holdAt = null;

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(0);
    });

    it("should return 0 for an expired question (clamped to 0)", () => {
      const now = new Date("2026-08-25T13:00:00Z");
      vi.setSystemTime(now);

      // Question created 3 hours ago. Expired.
      const createdAt = new Date("2026-08-25T10:00:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 0;
      const holdAt = null;

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(0);
    });

    it("should extend the deadline by the accumulated hold time", () => {
      const now = new Date("2026-08-25T12:00:00Z");
      vi.setSystemTime(now);

      // Question created 2 hours ago.
      // But has accumulated hold time of 30 minutes.
      // Remaining should be 30 minutes (1800000 ms) instead of 0.
      const createdAt = new Date("2026-08-25T10:00:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 30 * 60 * 1000;
      const holdAt = null;

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(30 * 60 * 1000);
    });

    it("should freeze the timer when active hold is set", () => {
      // Question created at 10:00Z.
      // Hold started at 11:00Z.
      // We check remaining time relative to the hold start time, not "now".
      // Deadline (without hold shift) is 12:00Z.
      // At hold start (11:00Z), remaining time should freeze at 1 hour (3600000 ms).
      const now = new Date("2026-08-25T11:30:00Z"); // Cur time is 11:30Z
      vi.setSystemTime(now);

      const createdAt = new Date("2026-08-25T10:00:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 0;
      const holdAt = new Date("2026-08-25T11:00:00Z").toISOString();

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(1 * 60 * 60 * 1000); // 1 hour remaining, not 30 mins
    });

    it("should return 0 if hold starts after the deadline has already passed", () => {
      const now = new Date("2026-08-25T13:00:00Z");
      vi.setSystemTime(now);

      const createdAt = new Date("2026-08-25T10:00:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 0;
      const holdAt = new Date("2026-08-25T12:30:00Z").toISOString(); // Hold after deadline (12:00Z)

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(0);
    });

    it("should return 0 for invalid createdAt values", () => {
      const remainingEmpty = computeRemainingMs("", 2, 0, null);
      const remainingGarbage = computeRemainingMs("not-a-date", 2, 0, null);

      expect(remainingEmpty).toBe(0);
      expect(remainingGarbage).toBe(0);
    });

    it("should ignore invalid holdAt values and use current system time instead", () => {
      const now = new Date("2026-08-25T11:00:00Z");
      vi.setSystemTime(now);

      const createdAt = new Date("2026-08-25T10:00:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 0;
      const holdAt = "garbage-date";

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(1 * 60 * 60 * 1000); // Calculates normally using 'now' (11:00Z)
    });

    it("should calculate correctly with zero accumulated hold time", () => {
      const now = new Date("2026-08-25T11:00:00Z");
      vi.setSystemTime(now);

      const createdAt = new Date("2026-08-25T10:00:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 0;
      const holdAt = null;

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(1 * 60 * 60 * 1000);
    });

    it("should handle large accumulated hold times correctly", () => {
      const now = new Date("2026-08-25T12:00:00Z");
      vi.setSystemTime(now);

      // Question created 2 hours ago.
      // Large hold time of 5 days (432000000 ms).
      // Remaining should be exactly 5 days.
      const createdAt = new Date("2026-08-25T10:00:00Z").toISOString();
      const durationHours = 2;
      const accumulatedHoldMs = 5 * 24 * 60 * 60 * 1000;
      const holdAt = null;

      const remaining = computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt);
      expect(remaining).toBe(5 * 24 * 60 * 60 * 1000);
    });
  });

  describe("buildHoldCountdownOptions", () => {
    it("should populate options when status is 'hold'", () => {
      const q = {
        status: "hold",
        holdAt: "2026-08-25T11:00:00Z",
        accumulatedHoldMs: 5000
      };

      const options = buildHoldCountdownOptions(q);
      expect(options).toEqual({
        accumulatedHoldMs: 5000,
        holdAt: "2026-08-25T11:00:00Z"
      });
    });

    it("should set holdAt to undefined when status is not 'hold'", () => {
      const q = {
        status: "open",
        holdAt: "2026-08-25T11:00:00Z",
        accumulatedHoldMs: 5000
      };

      const options = buildHoldCountdownOptions(q);
      expect(options).toEqual({
        accumulatedHoldMs: 5000,
        holdAt: undefined
      });
    });

    it("should default accumulatedHoldMs to 0 if null/undefined", () => {
      const q = {
        status: "open",
        holdAt: null,
        accumulatedHoldMs: null
      };

      const options = buildHoldCountdownOptions(q);
      expect(options).toEqual({
        accumulatedHoldMs: 0,
        holdAt: undefined
      });
    });
  });
});
