import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { buildHoldCountdownOptions, useCountdown } from "./useCountdown";

describe("buildHoldCountdownOptions", () => {
  it("should extract accumulatedHoldMs and holdAt when status is 'hold'", () => {
    const result = buildHoldCountdownOptions({
      status: "hold",
      holdAt: "2026-08-31T12:00:00Z",
      accumulatedHoldMs: 15000,
    });
    expect(result).toEqual({
      accumulatedHoldMs: 15000,
      holdAt: "2026-08-31T12:00:00Z",
    });
  });

  it("should return holdAt as undefined when status is not 'hold' even if holdAt is provided", () => {
    const result = buildHoldCountdownOptions({
      status: "open",
      holdAt: "2026-08-31T12:00:00Z",
      accumulatedHoldMs: 10000,
    });
    expect(result).toEqual({
      accumulatedHoldMs: 10000,
      holdAt: undefined,
    });
  });

  it("should default accumulatedHoldMs to 0 if not provided", () => {
    const result = buildHoldCountdownOptions({
      status: "hold",
      holdAt: "2026-08-31T12:00:00Z",
    });
    expect(result.accumulatedHoldMs).toBe(0);
  });

  it("should default accumulatedHoldMs to 0 if it is null", () => {
    const result = buildHoldCountdownOptions({
      status: "hold",
      holdAt: "2026-08-31T12:00:00Z",
      accumulatedHoldMs: null,
    });
    expect(result.accumulatedHoldMs).toBe(0);
  });

  it("should return holdAt as undefined if status is 'hold' but holdAt is null/undefined", () => {
    const result = buildHoldCountdownOptions({
      status: "hold",
      holdAt: null,
    });
    expect(result.holdAt).toBeUndefined();
  });

  it("should handle an empty object input by returning default options", () => {
    const result = buildHoldCountdownOptions({});
    expect(result).toEqual({
      accumulatedHoldMs: 0,
      holdAt: undefined,
    });
  });

  it("should handle null and undefined input parameter safely", () => {
    expect(buildHoldCountdownOptions(null)).toEqual({
      accumulatedHoldMs: 0,
      holdAt: undefined,
    });
    expect(buildHoldCountdownOptions(undefined)).toEqual({
      accumulatedHoldMs: 0,
      holdAt: undefined,
    });
  });

  it("should ignore extra/irrelevant fields on the question input", () => {
    const result = buildHoldCountdownOptions({
      status: "hold",
      holdAt: "2026-08-31T12:00:00Z",
      accumulatedHoldMs: 5000,
      someOtherField: "ignore me",
      anotherOne: 123
    } as any);
    expect(result).toEqual({
      accumulatedHoldMs: 5000,
      holdAt: "2026-08-31T12:00:00Z",
    });
  });
});

describe("useCountdown hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should format remaining time correctly for positive durations", () => {
    const createdAt = new Date().toISOString();
    const durationHours = 2; // 2 hours
    const onExpire = vi.fn();

    const { result } = renderHook(() => useCountdown(createdAt, durationHours, onExpire));
    
    // Initial render should be "02:00:00"
    expect(result.current).toBe("02:00:00");
  });

  it("should count down by 1 second on each tick", () => {
    const createdAt = new Date().toISOString();
    const durationHours = 1;
    const onExpire = vi.fn();

    const { result } = renderHook(() => useCountdown(createdAt, durationHours, onExpire));
    expect(result.current).toBe("01:00:00");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe("00:59:59");

    act(() => {
      vi.advanceTimersByTime(59000);
    });
    expect(result.current).toBe("00:59:00");
  });

  it("should trigger onExpire and display '00:00:00' when countdown runs out", () => {
    const createdAt = new Date().toISOString();
    const durationHours = 1; // 1 hour = 3600 seconds
    const onExpire = vi.fn();

    const { result } = renderHook(() => useCountdown(createdAt, durationHours, onExpire));
    
    act(() => {
      vi.advanceTimersByTime(3600 * 1000);
    });
    
    expect(result.current).toBe("00:00:00");
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("should return '00:00:00' immediately if createdAt is already expired", () => {
    // 3 hours in the past
    const createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const durationHours = 2; // 2 hour SLA
    const onExpire = vi.fn();

    const { result } = renderHook(() => useCountdown(createdAt, durationHours, onExpire));
    
    expect(result.current).toBe("00:00:00");
    // Should call onExpire on mounting since it is already expired
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("should return '00:00:00' if createdAt is null, undefined, or empty", () => {
    const onExpire = vi.fn();
    
    const { result: resNull } = renderHook(() => useCountdown(null, 2, onExpire));
    expect(resNull.current).toBe("00:00:00");

    const { result: resUndefined } = renderHook(() => useCountdown(undefined, 2, onExpire));
    expect(resUndefined.current).toBe("00:00:00");

    const { result: resEmpty } = renderHook(() => useCountdown("", 2, onExpire));
    expect(resEmpty.current).toBe("00:00:00");
  });

  it("should return '00:00:00' if createdAt is an invalid date string", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useCountdown("not-a-date", 2, onExpire));
    expect(result.current).toBe("00:00:00");
  });

  it("should freeze the countdown when holdAt is specified (active hold state)", () => {
    const now = Date.now();
    const createdAt = new Date(now - 30 * 60 * 1000).toISOString(); // 30 mins ago
    const holdAt = new Date(now).toISOString(); // held now (remaining should freeze at 1h 30m)
    const onExpire = vi.fn();

    const { result } = renderHook(() =>
      useCountdown(createdAt, 2, onExpire, {
        accumulatedHoldMs: 0,
        holdAt: holdAt,
      })
    );

    expect(result.current).toBe("01:30:00");

    // Advance real time by 10 minutes, but check that countdown remains frozen
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(result.current).toBe("01:30:00");
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("should shift the deadline forward when accumulatedHoldMs is provided", () => {
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const onExpire = vi.fn();
    const accumulatedHoldMs = 20 * 60 * 1000; // 20 minutes of accumulated hold

    const { result } = renderHook(() =>
      useCountdown(createdAt, 2, onExpire, {
        accumulatedHoldMs: accumulatedHoldMs,
      })
    );

    // Initial value should be 2 hours + 20 minutes = 2 hours, 20 minutes, 00 seconds
    // Due to (% 24) on hour, it should correctly render "02:20:00"
    expect(result.current).toBe("02:20:00");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe("02:19:59");
  });

  it("should wrap hours around using % 24 when remaining time exceeds 24 hours", () => {
    const createdAt = new Date().toISOString();
    const onExpire = vi.fn();
    
    // SLA of 25 hours. Due to (% 24), it should wrap and display "01:00:00"
    const { result } = renderHook(() => useCountdown(createdAt, 25, onExpire));
    expect(result.current).toBe("01:00:00");
  });

  it("should handle holdAt being an invalid date by not freezing the timer", () => {
    const createdAt = new Date().toISOString();
    const onExpire = vi.fn();

    const { result } = renderHook(() =>
      useCountdown(createdAt, 1, onExpire, {
        accumulatedHoldMs: 0,
        holdAt: "invalid-date",
      })
    );

    expect(result.current).toBe("01:00:00");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe("00:59:59"); // Timer still ticked down
  });
});
