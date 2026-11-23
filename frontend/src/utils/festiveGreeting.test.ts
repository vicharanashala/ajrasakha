import { describe, expect, it } from "vitest";
import {
  DIWALI_WISHES,
  getTimeOfDayGreeting,
  pickWishIndex,
} from "./festiveGreeting";

const now = new Date(2026, 10, 7, 19, 0);

describe("getTimeOfDayGreeting", () => {
  it("follows the local hour", () => {
    expect(getTimeOfDayGreeting(new Date(2026, 10, 7, 8))).toBe("Good morning");
    expect(getTimeOfDayGreeting(new Date(2026, 10, 7, 14))).toBe("Good afternoon");
    expect(getTimeOfDayGreeting(now)).toBe("Good evening");
  });
});

describe("pickWishIndex", () => {
  it("is stable for a seed and within range", () => {
    const index = pickWishIndex("user-1:2026-11-07", DIWALI_WISHES.length);
    expect(index).toBe(pickWishIndex("user-1:2026-11-07", DIWALI_WISHES.length));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(DIWALI_WISHES.length);
  });
});
