// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";

const MIN_PCT = 15;
const MAX_PCT = 85;

// Vertical split between two panels (Upload Queue / Translation Queue) with a draggable middle
// handle — drag up shrinks the top panel and grows the bottom one, and vice versa. Total height
// is capped so the pair never overflows the viewport; each panel scrolls internally instead.
export default function ResizableSplitPanel({ top, bottom }) {
  const containerRef = useRef(null);
  const [topPct, setTopPct] = useState(50);
  const draggingRef = useRef(false);

  const onMouseMove = useCallback((e) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    setTopPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
  }, []);

  const onMouseUp = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  function startDrag() {
    draggingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-screen max-h-screen rounded-lg border border-border overflow-hidden"
    >
      <div style={{ height: `${topPct}%` }} className="min-h-0 overflow-hidden">
        {top}
      </div>
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-center h-2.5 shrink-0 border-y border-border/50 bg-muted/30 hover:bg-muted/60 cursor-row-resize transition-colors"
        title="Drag to resize"
      >
        <GripHorizontal size={12} className="text-muted-foreground" />
      </div>
      <div style={{ height: `${100 - topPct}%` }} className="min-h-0 overflow-hidden">
        {bottom}
      </div>
    </div>
  );
}
