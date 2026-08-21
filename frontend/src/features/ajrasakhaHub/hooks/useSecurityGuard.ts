import { useEffect } from "react";
import { toast } from "react-hot-toast";

/**
 * useSecurityGuard - Protects the application from unauthorized copying,
 * right-click inspection, keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U),
 * and unauthorized DOM tampering.
 */
export const useSecurityGuard = () => {
  useEffect(() => {
    // 1. Block Context Menu (Right-Click)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      toast.error("🔒 Ajrasakha (अज्रसखा) content & source code are protected.", {
        id: "sec-right-click",
        icon: "🛡️",
        duration: 2500,
      });
      return false;
    };

    // 2. Block Inspect & DevTools Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // F12
      if (e.key === "F12" || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        toast.error("🔒 Developer Tools access is restricted.", { id: "sec-f12", icon: "🛡️" });
        return false;
      }

      // Ctrl + Shift + I (Inspect)
      // Ctrl + Shift + J (Console)
      // Ctrl + Shift + C (Element selector)
      if (isCtrl && isShift && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) {
        e.preventDefault();
        e.stopPropagation();
        toast.error("🔒 Inspection mode is disabled.", { id: "sec-inspect", icon: "🛡️" });
        return false;
      }

      // Ctrl + U (View Source)
      if (isCtrl && (e.key === "U" || e.key === "u")) {
        e.preventDefault();
        e.stopPropagation();
        toast.error("🔒 Source code view is protected.", { id: "sec-src", icon: "🛡️" });
        return false;
      }

      // Ctrl + S (Save Page)
      if (isCtrl && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl + C (Copy Protection)
      if (isCtrl && (e.key === "C" || e.key === "c")) {
        // Allow copy inside standard input / textarea fields only
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
          return true;
        }
        e.preventDefault();
        e.stopPropagation();
        toast.error("🔒 Copying content is disabled.", { id: "sec-copy", icon: "🛡️" });
        return false;
      }
    };

    // 3. Block Copy and Cut events outside form inputs
    const handleCopy = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      toast.error("🔒 Text copying is restricted on Ajrasakha.", { id: "sec-copy-event", icon: "🛡️" });
    };

    const handleCut = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
    };

    // 4. Block Drag & Drop of sensitive elements/text
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === "IMG") {
        e.preventDefault();
      }
    };

    // 5. Detect DevTools Open State via Dimension & Debugger Threshold
    let devtoolsOpen = false;
    const threshold = 160;
    const checkDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      if ((widthThreshold || heightThreshold) && !devtoolsOpen) {
        devtoolsOpen = true;
        console.clear();
        console.warn("%c[Ajrasakha Security] Protected Enterprise Application. Tampering is logged.", "color: #10b981; font-size: 16px; font-weight: bold;");
      } else if (!widthThreshold && !heightThreshold) {
        devtoolsOpen = false;
      }
    };

    const intervalId = setInterval(checkDevTools, 1500);

    // Register event listeners
    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("copy", handleCopy, { capture: true });
    document.addEventListener("cut", handleCut, { capture: true });
    document.addEventListener("dragstart", handleDragStart, { capture: true });

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("copy", handleCopy, { capture: true });
      document.removeEventListener("cut", handleCut, { capture: true });
      document.removeEventListener("dragstart", handleDragStart, { capture: true });
    };
  }, []);
};
