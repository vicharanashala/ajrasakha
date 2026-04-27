import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface MultiSelectItem {
  value: string;
  label: React.ReactNode;
}

interface MultiSelectProps {
  items: MultiSelectItem[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  getDisplayLabel?: (selected: string[]) => string;
  headerSlot?: React.ReactNode;
}

export const MultiSelect = ({
  items,
  selected,
  onChange,
  placeholder = "All",
  getDisplayLabel,
  headerSlot,
}: MultiSelectProps) => {
  const [open, setOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const startScroll = (direction: "up" | "down") => {
    stopScroll();
    scrollInterval.current = setInterval(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop += direction === "down" ? 6 : -6;
      }
    }, 16);
  };

  const stopScroll = () => {
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  };
  React.useEffect(() => {
    return () => stopScroll();
  }, []);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value]);

  const displayText = getDisplayLabel
    ? getDisplayLabel(selected)
    : selected.length === 0
    ? placeholder
    : selected.length === 1
    ? selected[0]
    : `${selected.length} selected`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate text-left">{displayText}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
        ) : (
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-input bg-popover shadow-md">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-xs font-medium text-muted-foreground">
              {selected.length} selected
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          </div>

          {headerSlot}

          <div
            className="flex items-center justify-center h-6 cursor-pointer select-none text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            onMouseEnter={() => startScroll("up")}
            onMouseLeave={stopScroll}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </div>

          <div ref={scrollRef} className="max-h-48 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {items.map((item) => {
              const isSelected = selected.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggle(item.value)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <div
                    className={`h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      isSelected ? "bg-primary border-primary" : "border-gray-400 bg-white"
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {item.label}
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center justify-center h-6 cursor-pointer select-none text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            onMouseEnter={() => startScroll("down")}
            onMouseLeave={stopScroll}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
    </div>
  );
};
