import { useEffect, useRef } from "react";

export interface KeyboardShortcut {
  /** KeyboardEvent.key, e.g. "/", "n", "ArrowRight", "Escape". Letters match either case. */
  key: string;
  handler: (event: KeyboardEvent) => void;
  /** Also fire while the user is typing in an input, textarea or select. */
  allowInInputs?: boolean;
}

/** True when the event comes from a field the user is typing in. */
const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

/**
 * Registers single-key page shortcuts. Shortcuts are skipped while typing (unless
 * allowed), when a modifier key is held, or while `enabled` returns false, e.g. when
 * a dialog is open on top of the page.
 */
export const useKeyboardShortcuts = (
  shortcuts: KeyboardShortcut[],
  enabled: () => boolean = () => true,
) => {
  // Kept in a ref so handlers always see current state without re-binding the listener.
  const latest = useRef({ shortcuts, enabled });
  latest.current = { shortcuts, enabled };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!latest.current.enabled()) return;
      const typing = isTypingTarget(event.target);
      const shortcut = latest.current.shortcuts.find(
        (s) => s.key.toLowerCase() === event.key.toLowerCase() && (!typing || s.allowInInputs),
      );
      if (!shortcut) return;
      event.preventDefault();
      shortcut.handler(event);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
};
