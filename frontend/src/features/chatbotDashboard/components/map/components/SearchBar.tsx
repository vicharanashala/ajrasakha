/* ============================================================
   SEARCH BAR - Search input with dropdown results
============================================================ */

import { Search, X } from "lucide-react";
import type { SearchHit } from "../lib/types";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  hits: SearchHit[];
  onSelect: (hit: SearchHit) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  hits,
  onSelect,
  placeholder = "Search state, district, village, block, KVK…",
}: SearchBarProps) {
  return (
    <div className="ml-auto relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-72 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {value && (
          <button onClick={() => onChange("")}>
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
      {hits.length > 0 && (
        <div className="absolute right-0 z-[1000] mt-1 max-h-80 w-96 overflow-auto rounded-xl border border-border bg-popover shadow-2xl">
          {hits.map((h, i) => (
            <button
              key={i}
              onClick={() => onSelect(h)}
              className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="truncate text-popover-foreground">
                {h.label}
              </span>
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {h.sub}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
