import { describe, it, expect } from "vitest";
import { getTimerStartTime } from "./getTimerStartTime";

describe("getTimerStartTime", () => {
  it("should return the correct createdAt timestamp when present", () => {
    const question = { createdAt: "2026-08-31T12:00:00Z" };
    expect(getTimerStartTime(question)).toBe("2026-08-31T12:00:00Z");
  });

  it("should return an empty string when createdAt is undefined", () => {
    const question = { createdAt: undefined };
    expect(getTimerStartTime(question)).toBe("");
  });

  it("should return an empty string when createdAt is null", () => {
    const question = { createdAt: null as any };
    expect(getTimerStartTime(question)).toBe("");
  });

  it("should return an empty string when the question object is empty", () => {
    expect(getTimerStartTime({})).toBe("");
  });

  it("should return an empty string when the question parameter is null", () => {
    expect(getTimerStartTime(null as any)).toBe("");
  });

  it("should return an empty string when the question parameter is undefined", () => {
    expect(getTimerStartTime(undefined as any)).toBe("");
  });

  it("should ignore extra/irrelevant fields and still return the correct createdAt", () => {
    const question = {
      createdAt: "2026-08-31T12:00:00Z",
      id: "question-123",
      status: "open",
      details: { crop: "Rice", state: "Andhra Pradesh" },
      submission: { history: [], queue: { length: 0 } }
    };
    expect(getTimerStartTime(question)).toBe("2026-08-31T12:00:00Z");
  });
});
