import { useEffect, useRef } from "react";
import { UserService } from "@/hooks/services/userService";
import { useAuthStore } from "@/stores/auth-store";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";

export type TrackedFeature = "pop_management" | "gdb_cleaning";

const HEARTBEAT_INTERVAL_MS = 25000; // 25 seconds
const MIN_FLUSH_DURATION_MS = 3000;  // Don't send micro-blips under 3s
const IDLE_TIMEOUT_MS = 90000;       // 90 seconds of no user interaction pauses tracking

/**
 * Tracks active, focused user time in specific platform features (e.g. POP Management, GDB Cleaning).
 *
 * Accurately handles:
 * - User identification via useGetCurrentUser() / userIdProp / auth-store
 * - Tab visibility changes (pauses when hidden/backgrounded)
 * - Window focus/blur (pauses when user switches to other windows)
 * - User idle detection (pauses if no mouse, keyboard, or scroll activity for > 90s)
 * - Periodic heartbeats while active
 * - Clean flush on unmount or navigation
 */
export function useTrackFeatureActivity(
  feature: TrackedFeature,
  enabled: boolean = true,
  userIdProp?: string | null,
) {
  // In AjraSakha, the full MongoDB user object (containing _id) is managed by useGetCurrentUser()
  const { data: currentUser } = useGetCurrentUser();
  const authStoreUser = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const resolvedUserId = userIdProp || currentUser?._id || authStoreUser?.uid;
  const isReady = Boolean(enabled && (resolvedUserId || isAuthenticated || authStoreUser));

  // References to keep mutable timing state without triggering re-renders
  const stateRef = useRef({
    accumulatedMs: 0,
    lastTickTime: Date.now(),
    lastUserActivityTime: Date.now(),
    isWindowFocused: typeof document !== "undefined" ? document.hasFocus() : true,
    isTabVisible: typeof document !== "undefined" ? document.visibilityState === "visible" : true,
    isIdle: false,
    sessionStartTime: new Date().toISOString(),
  });

  const userServiceRef = useRef(new UserService());

  useEffect(() => {
    if (!isReady) return;

    const state = stateRef.current;
    state.lastTickTime = Date.now();
    state.lastUserActivityTime = Date.now();
    state.isWindowFocused = document.hasFocus();
    state.isTabVisible = document.visibilityState === "visible";
    state.isIdle = false;
    state.sessionStartTime = new Date().toISOString();

    // Sends accumulated active time to the backend
    const flushAccumulated = (isFinal = false) => {
      const now = Date.now();
      // Tick any elapsed time before flushing if currently active
      if (state.isTabVisible && state.isWindowFocused && !state.isIdle) {
        const delta = now - state.lastTickTime;
        if (delta > 0 && delta < 120000) {
          state.accumulatedMs += delta;
        }
      }
      state.lastTickTime = now;

      const durationToSend = Math.round(state.accumulatedMs);
      if (durationToSend >= (isFinal ? 2000 : MIN_FLUSH_DURATION_MS)) {
        state.accumulatedMs = 0;
        const endTime = new Date().toISOString();
        userServiceRef.current
          .trackFeatureActivity({
            feature,
            durationMs: durationToSend,
            startTime: state.sessionStartTime,
            endTime,
          })
          .catch(() => {
            // Silently ignore background tracking network errors
          });
        state.sessionStartTime = endTime;
      }
    };

    // User interaction listener to reset idle state
    const handleUserInteraction = () => {
      const now = Date.now();
      state.lastUserActivityTime = now;
      if (state.isIdle) {
        state.isIdle = false;
        state.lastTickTime = now; // Resume ticking from now
      }
    };

    // Visibility change listener
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      if (!isVisible) {
        flushAccumulated();
      } else {
        state.lastTickTime = Date.now();
        state.lastUserActivityTime = Date.now();
      }
      state.isTabVisible = isVisible;
    };

    // Focus & blur listeners
    const handleFocus = () => {
      state.isWindowFocused = true;
      state.lastTickTime = Date.now();
      state.lastUserActivityTime = Date.now();
    };

    const handleBlur = () => {
      flushAccumulated();
      state.isWindowFocused = false;
    };

    // Periodic tick and heartbeat interval
    const intervalId = setInterval(() => {
      const now = Date.now();

      // Check for user idle
      if (now - state.lastUserActivityTime > IDLE_TIMEOUT_MS) {
        if (!state.isIdle) {
          state.isIdle = true;
          flushAccumulated();
        }
      }

      // If active, accumulate time
      if (state.isTabVisible && state.isWindowFocused && !state.isIdle) {
        const delta = now - state.lastTickTime;
        if (delta > 0 && delta < 60000) {
          state.accumulatedMs += delta;
        }
      }
      state.lastTickTime = now;

      // Flush if accumulated active time reached threshold
      if (state.accumulatedMs >= MIN_FLUSH_DURATION_MS) {
        flushAccumulated();
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Event listeners
    window.addEventListener("mousemove", handleUserInteraction, { passive: true });
    window.addEventListener("mousedown", handleUserInteraction, { passive: true });
    window.addEventListener("keydown", handleUserInteraction, { passive: true });
    window.addEventListener("scroll", handleUserInteraction, { passive: true });
    window.addEventListener("touchstart", handleUserInteraction, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("mousemove", handleUserInteraction);
      window.removeEventListener("mousedown", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
      window.removeEventListener("scroll", handleUserInteraction);
      window.removeEventListener("touchstart", handleUserInteraction);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      flushAccumulated(true);
    };
  }, [feature, isReady, resolvedUserId]);
}
