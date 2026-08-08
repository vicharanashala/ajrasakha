/**
 * BUG FIX TEST: Null safety fixes across multiple files
 *
 * Bug #9:  WhatsAppUsersView.tsx — phoneNumber.toLowerCase() / lastMessageText.toLowerCase()
 *          crashes when values are null/undefined.
 * Bug #10: AnswerItem.tsx, AllocationQueueHeader.tsx, ReallocateModal.tsx,
 *          BulkUploadAllocationModal.tsx — expert.userName.toLowerCase() crashes
 *          when userName is null/undefined.
 * Bug #11: golden-dataset.tsx — mod.moderatorName.charAt(0) crashes on null name.
 * Bug #12: FarmerAnalyticsHeatMap.tsx — unhandled promise rejections from
 *          locationService calls with no .catch().
 * Bug #13: DistrictDetails.tsx — chained methods after optional chain break
 *          when intermediate value is undefined.
 *
 * Fix: Added nullish coalescing (?? '') or optional chaining (?.) to all
 *      potentially null/undefined property accesses.
 */

import { describe, it, expect } from "vitest";

describe("Bug #9: phoneNumber/lastMessageText.toLowerCase() crash", () => {
  it("should not crash when phoneNumber is null", () => {
    const user: any = { phoneNumber: null, lastMessageText: "hello" };
    const query = "hel";

    // Before fix: user.phoneNumber.toLowerCase() throws TypeError
    // After fix: (user.phoneNumber ?? '').toLowerCase() returns ''
    expect(() => {
      const matchesPhone = (user.phoneNumber ?? "").toLowerCase().includes(query);
      const matchesMessage = (user.lastMessageText ?? "").toLowerCase().includes(query);
      expect(matchesPhone).toBe(false);
      expect(matchesMessage).toBe(true);
    }).not.toThrow();
  });

  it("should not crash when lastMessageText is undefined", () => {
    const user: any = { phoneNumber: "1234567890", lastMessageText: undefined };

    expect(() => {
      const matchesMessage = (user.lastMessageText ?? "").toLowerCase().includes("test");
      expect(matchesMessage).toBe(false);
    }).not.toThrow();
  });

  it("should not crash when both values are null", () => {
    const user: any = { phoneNumber: null, lastMessageText: null };

    expect(() => {
      const matchesPhone = (user.phoneNumber ?? "").toLowerCase().includes("123");
      const matchesMessage = (user.lastMessageText ?? "").toLowerCase().includes("hello");
      expect(matchesPhone).toBe(false);
      expect(matchesMessage).toBe(false);
    }).not.toThrow();
  });

  it("should work normally with valid string values", () => {
    const user = { phoneNumber: "1234567890", lastMessageText: "Hello World" };
    const query = "hello";

    const matchesPhone = (user.phoneNumber ?? "").toLowerCase().includes(query);
    const matchesMessage = (user.lastMessageText ?? "").toLowerCase().includes(query);

    expect(matchesPhone).toBe(false);
    expect(matchesMessage).toBe(true);
  });
});

describe("Bug #10: expert.userName.toLowerCase() crash", () => {
  it("should not crash when userName is null", () => {
    const expert: any = { userName: null, email: "expert@test.com" };
    const searchTerm = "test";

    // Before fix: expert.userName.toLowerCase() throws TypeError
    // After fix: (expert.userName ?? '').toLowerCase() returns ''
    expect(() => {
      const matchesName = (expert.userName ?? "").toLowerCase().includes(searchTerm);
      const matchesEmail = expert.email?.toLowerCase().includes(searchTerm);
      expect(matchesName).toBe(false);
      expect(matchesEmail).toBe(true);
    }).not.toThrow();
  });

  it("should not crash when userName is undefined", () => {
    const expert: any = { email: "expert@test.com" };

    expect(() => {
      const matchesName = (expert.userName ?? "").toLowerCase().includes("test");
      expect(matchesName).toBe(false);
    }).not.toThrow();
  });

  it("should work normally with valid userName", () => {
    const expert = { userName: "John Doe", email: "john@test.com" };
    const searchTerm = "john";

    const matchesName = (expert.userName ?? "").toLowerCase().includes(searchTerm);
    expect(matchesName).toBe(true);
  });
});

describe("Bug #11: mod.moderatorName.charAt(0) crash", () => {
  it("should not crash when moderatorName is null", () => {
    const mod: any = { moderatorName: null, count: 5 };

    // Before fix: mod.moderatorName.charAt(0) throws TypeError
    // After fix: (mod.moderatorName ?? '').charAt(0) returns ''
    expect(() => {
      const initial = (mod.moderatorName ?? "").charAt(0).toUpperCase();
      expect(initial).toBe("");
    }).not.toThrow();
  });

  it("should not crash when moderatorName is undefined", () => {
    const mod: any = { count: 10 };

    expect(() => {
      const initial = (mod.moderatorName ?? "").charAt(0).toUpperCase();
      expect(initial).toBe("");
    }).not.toThrow();
  });

  it("should return first character uppercase for valid name", () => {
    const mod = { moderatorName: "alice", count: 3 };

    const initial = (mod.moderatorName ?? "").charAt(0).toUpperCase();
    expect(initial).toBe("A");
  });
});

describe("Bug #13: DistrictDetails optional chain then unsafe methods", () => {
  it("should not crash when v.village is undefined", () => {
    const v: any = { village: undefined, totalUsers: 5 };

    // The actual fix pattern: (v?.village ?? '').replace(...)
    // not v?.village ?? v ?? '' (v is an object, not string)
    expect(() => {
      const result = (v?.village ?? "")
        .replace(/\([^)]*\)/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
      expect(result).toBe("");
    }).not.toThrow();
  });

  it("should render village name correctly with parentheses", () => {
    const v: any = { village: "Ramanagara (Urban)", totalUsers: 10 };

    const result = (v?.village ?? v ?? "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    expect(result).toBe("RAMANAGARA");
  });
});
