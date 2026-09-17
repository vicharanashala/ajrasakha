// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

// Popover range filter for a numeric column (pages, year, month) — same trigger/positioning
// pattern as ColumnFilter.tsx, but the panel holds a Min/Max pair instead of a checklist.
//
// Sends `filter[<field>_min]` / `filter[<field>_max]`, either end optional — confirmed by the
// backend as the real range convention (numeric fields take `_min`/`_max`, date fields
// `_from`/`_to`, see DateRangeColumnFilter.tsx).
export default function RangeFilter({ label, min, max, onChange, minBound, maxBound }) {
  const [open, setOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(min ?? "");
  const [draftMax, setDraftMax] = useState(max ?? "");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    setDraftMin(min ?? "");
    setDraftMax(max ?? "");
  }, [min, max]);

  useEffect(() => {
    function onClickOutside(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((o) => !o);
  }

  function apply() {
    onChange(draftMin === "" ? null : draftMin, draftMax === "" ? null : draftMax);
  }

  function clear() {
    setDraftMin("");
    setDraftMax("");
    onChange(null, null);
  }

  const hasSelection = min != null || max != null;

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`flex items-center gap-1 font-semibold text-[11px] uppercase tracking-wide transition-colors cursor-pointer
          ${hasSelection ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
      >
        {label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: "11rem" }}
          className="rounded-lg border border-border bg-card shadow-xl p-2 flex flex-col gap-2"
        >
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={minBound}
              max={maxBound}
              value={draftMin}
              onChange={(e) => setDraftMin(e.target.value)}
              placeholder="Min"
              className="w-full bg-input border border-border rounded px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-[10px] text-muted-foreground">–</span>
            <input
              type="number"
              min={minBound}
              max={maxBound}
              value={draftMax}
              onChange={(e) => setDraftMax(e.target.value)}
              placeholder="Max"
              className="w-full bg-input border border-border rounded px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={clear}
            >
              <X size={10} /> Clear
            </button>
            <button
              className="text-[10px] px-2 py-0.5 rounded border border-primary text-primary hover:bg-primary/10 transition-colors cursor-pointer"
              onClick={() => {
                apply();
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
