// @ts-nocheck
import { useEffect, useState } from "react";

// Debounced free-text column filter (spec §5: "text input for free-text columns") — sibling to
// ColumnFilter.tsx, which only handles discrete/enum-like columns via a checkbox dropdown. Used
// for columns like Document ID that have no fixed option set to pick from.
export default function TextFilter({ label, value, onChange, placeholder }) {
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== (value || "")) onChange(draft);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="flex flex-col gap-1">
      <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">
        {label}
      </span>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder || "Filter…"}
        className="w-28 bg-input border border-border rounded px-1.5 py-0.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
