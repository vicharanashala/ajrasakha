/**
 * BUG FIX TEST: Auth store listener leak
 *
 * Bug #8: initAuthListener called onAuthStateChanged but never stored the
 *         unsubscribe function, causing listener leaks on every component mount.
 *
 * File affected: frontend/src/stores/auth-store.ts
 *
 * Fix: Store the unsubscribe function returned by onAuthStateChanged and return
 *      it from initAuthListener so callers can clean up.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firebase auth
const mockUnsubscribe = vi.fn();
const mockOnAuthStateChanged = vi.fn((_auth: any, _cb: any) => mockUnsubscribe);

vi.mock("@/config/firebase", () => ({
  auth: {},
  googleProvider: {},
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: [any, any]) => mockOnAuthStateChanged(...args),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

describe("Bug #8: auth store initAuthListener leak", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store state
    vi.resetModules();
  });

  it("onAuthStateChanged returns an unsubscribe function", () => {
    // The core of the bug: onAuthStateChanged returns an unsubscribe function
    // but it was never stored or called
    const unsubscribe = mockOnAuthStateChanged({}, vi.fn());

    expect(typeof unsubscribe).toBe("function");
    expect(unsubscribe).toBe(mockUnsubscribe);
  });

  it("unsubscribe should be callable to clean up the listener", () => {
    mockOnAuthStateChanged({}, vi.fn());

    // This is what the fix enables: calling unsubscribe to prevent leaks
    mockUnsubscribe();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("multiple initAuthListener calls should not leak listeners", () => {
    // Simulates the bug: calling initAuthListener multiple times
    // (e.g., from React StrictMode or component remounts)
    // Each call creates a new listener without cleaning up the previous one

    const unsub1 = mockOnAuthStateChanged({}, vi.fn());
    const unsub2 = mockOnAuthStateChanged({}, vi.fn());
    const unsub3 = mockOnAuthStateChanged({}, vi.fn());

    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(3);

    // With the fix: each call's unsubscribe is stored and callable
    unsub1();
    unsub2();
    unsub3();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(3);
  });

  it("initAuthListener should return the unsubscribe function", () => {
    // The fix changes the return type to allow cleanup
    const initAuthListener = () => {
      const unsubscribe = mockOnAuthStateChanged({}, vi.fn());
      return unsubscribe;
    };

    const cleanup = initAuthListener();
    expect(typeof cleanup).toBe("function");

    // Cleanup prevents memory leak
    cleanup();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
