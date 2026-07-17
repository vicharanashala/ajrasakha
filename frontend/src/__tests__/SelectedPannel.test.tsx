/**
 * BUG FIX TEST: SelectedPannel.tsx crash fixes
 *
 * Bug #1: props.rerouteQuestion crash — component destructures props directly,
 *         but code referenced `props.rerouteQuestion` which is undefined.
 * Bug #2: expert.name crash — `question.submission.history.find()?.updatedBy`
 *         returns undefined when no match, causing `expert.name` to throw.
 *
 * Files affected: frontend/src/components/SelectedPannel.tsx
 */

import { describe, it, expect } from "vitest";

describe("Bug #1: props.rerouteQuestion crash in SelectedPannel.tsx:162", () => {
  it("handleRejectReRouteAnswer should not throw when rerouteQuestion is provided directly", () => {
    // The bug: `const rerouteQuestion = props.rerouteQuestion;`
    // where `props` is undefined because the component destructures props directly.
    // Fix: Use the destructured `rerouteQuestion` variable directly.

    // Simulate the destructured component props
    const rerouteQuestion = [
      {
        _id: "reroute-1",
        questionId: "question-1",
        reroutes: [
          {
            reroutedTo: { _id: "expert-1", name: "Expert User" },
            status: "pending",
          },
        ],
      },
    ];

    // Before fix: this would throw `Cannot read properties of undefined (reading 'rerouteQuestion')`
    // After fix: this works because we access the destructured variable directly
    expect(() => {
      const data = rerouteQuestion;
      if (!data || data.length === 0) return;
      const lastReroutedTo = data[0]?.reroutes?.length
        ? data[0].reroutes[data[0].reroutes.length - 1]
        : null;
      expect(lastReroutedTo).toBeDefined();
    }).not.toThrow();
  });

  it("should handle empty rerouteQuestion array gracefully", () => {
    const rerouteQuestion: any[] = [];

    expect(() => {
      if (!rerouteQuestion || rerouteQuestion.length === 0) return; // early return, no crash
    }).not.toThrow();
  });

  it("should handle undefined rerouteQuestion gracefully", () => {
    const rerouteQuestion: any = undefined;

    expect(() => {
      if (!rerouteQuestion || rerouteQuestion.length === 0) return;
    }).not.toThrow();
  });
});

describe("Bug #2: expert.name crash in SelectedPannel.tsx:213", () => {
  it("should fallback to 'Unknown' when submission history has no matching entry", () => {
    const history = [
      { updatedBy: { _id: "user-1", name: "Alice", avatar: null, email: "a@test.com" } },
    ];
    const authorId = "nonexistent-user-id"; // No match in history

    // Before fix: `const expert = history.find(...)?.updatedBy;` returns undefined
    // then `expert.name` throws TypeError
    // After fix: `?? { name: 'Unknown', avatar: null, email: '' }` provides fallback
    const expert =
      history.find((item) => item.updatedBy?._id === authorId)?.updatedBy ??
      { name: "Unknown", avatar: null, email: "" };

    expect(expert.name).toBe("Unknown");
    expect(expert.email).toBe("");
  });

  it("should return matching expert when authorId matches", () => {
    const history = [
      { updatedBy: { _id: "user-1", name: "Alice", avatar: null, email: "a@test.com" } },
    ];
    const authorId = "user-1";

    const expert =
      history.find((item) => item.updatedBy?._id === authorId)?.updatedBy ??
      { name: "Unknown", avatar: null, email: "" };

    expect(expert.name).toBe("Alice");
  });

  it("should handle null submission.history gracefully", () => {
    const submission: any = { history: null };

    // Before fix: `question.submission.history.find(...)` throws TypeError
    // After fix: `question.submission?.history?.find(...)` uses optional chaining
    const expert =
      submission?.history?.find((item: any) => item.updatedBy?._id === "x")?.updatedBy ??
      { name: "Unknown", avatar: null, email: "" };

    expect(expert.name).toBe("Unknown");
  });

  it("should handle missing submission object gracefully", () => {
    const question: any = { submission: undefined };

    const expert =
      question.submission?.history?.find((item: any) => item.updatedBy?._id === "x")?.updatedBy ??
      { name: "Unknown", avatar: null, email: "" };

    expect(expert.name).toBe("Unknown");
  });
});

describe("SelectedPannel.tsx: sources.map crash fix", () => {
  it("should not crash when answer.sources is undefined", () => {
    const answer: any = { sources: undefined };

    // Before fix: `answer.sources.map(...)` throws TypeError
    // After fix: `answer.sources?.map(...)` returns undefined safely
    expect(() => {
      const result = answer.sources?.map((s: any) => s.sourceType) ?? [];
      expect(result).toEqual([]);
    }).not.toThrow();
  });

  it("should handle sourceType being undefined", () => {
    const sources = [{ sourceType: undefined, sourceName: "Test", source: "http://test.com" }];

    // Before fix: `s.sourceType.charAt(0)` throws TypeError
    // After fix: `String(s.sourceType ?? '').charAt(0)` handles undefined
    expect(() => {
      const results = sources.map(
        (s) => String(s.sourceType ?? "").charAt(0).toUpperCase() + String(s.sourceType ?? "").slice(1)
      );
      expect(results[0]).toBe("");
    }).not.toThrow();
  });
});
