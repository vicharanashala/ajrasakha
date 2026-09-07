// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

// Popover date-range filter — same trigger/positioning pattern as ColumnFilter.tsx/RangeFilter.tsx,
// panel holds a From/To date pair.
//
// Sends `filter[<field>_from]` / `filter[<field>_to]`, either end optional — confirmed by the
// backend as the real convention for date fields (`date_of_release`/`date_of_collection` were
// also confirmed added to the filter whitelist).
export default function DateRangeColumnFilter({ label, from, to, onChange }) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    setDraftFrom(from ?? "");
    setDraftTo(to ?? "");
  }, [from, to]);

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
    onChange(draftFrom || null, draftTo || null);
  }

  function clear() {
    setDraftFrom("");
    setDraftTo("");
    onChange(null, null);
  }

  const hasSelection = Boolean(from || to);

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
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: "12rem" }}
          className="rounded-lg border border-border bg-card shadow-xl p-2 flex flex-col gap-2"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">From</span>
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="w-full bg-input border border-border rounded px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-[10px] text-muted-foreground">To</span>
            <input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="w-full bg-input border border-border rounded px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
