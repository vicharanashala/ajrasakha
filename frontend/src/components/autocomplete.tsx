import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./atoms/input";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const highlightMatch = (text: string, query: string) => {
  if (!query) return <>{text}</>;

  const safeQuery = escapeRegExp(query);
  const parts = text.split(new RegExp(`(${safeQuery})`, "gi"));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="font-bold text-primary">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

export interface AutocompleteProps<T> {
  placeholder?: string;
  data?: T[];
  getDisplayValue: (item: T) => string;
  onSelect: (item: T) => void;
  onEnter?: (value: string) => void;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  isLoading?: boolean;
  isTyping?: boolean;
  renderItem?: (item: T, query: string) => React.ReactNode;
}

export function Autocomplete<T>({
  placeholder = "Search users...",
  data = [],
  getDisplayValue,
  onSelect,
  onEnter,
  value,
  onChange,
  onClear,
  isLoading = false,
  isTyping = false,
  renderItem,
}: AutocompleteProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visibleData = data.slice(0, 12);

  const getItemKey = (item: T, index: number) => {
    if (typeof item === "object" && item !== null && "_id" in item) {
      return String((item as { _id: string })._id);
    }

    return `${getDisplayValue(item)}-${index}`;
  };

  // Handle clicking outside to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item: T) => {
    setIsOpen(false);
    onSelect(item);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;

            e.preventDefault();
            setIsOpen(false);
            onEnter?.(value.trim());
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-9 pr-9 bg-background"
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              onClear();
              setIsOpen(false);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && value && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-md max-h-60 overflow-y-auto">
          {visibleData.length > 0 ? (
            <ul className="py-1">
              {visibleData.map((item, index) => (
                <li
                  key={getItemKey(item, index)}
                  className="px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onMouseDown={() => handleSelect(item)}
                >
                  {renderItem ? renderItem(item, value) : highlightMatch(getDisplayValue(item), value)}
                </li>
              ))}
            </ul>
          ) : isLoading ? (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              Searching...
            </div>
          ) : isTyping ? null : (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
