import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./atoms/input";

const highlightMatch = (text: string, query: string) => {
  if (!query) return <>{text}</>;

  const regex = new RegExp(`(${query})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
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
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  isLoading?: boolean;
  isTyping?: boolean;
}

export function Autocomplete<T>({
  placeholder = "Search users...",
  data = [],
  getDisplayValue,
  onSelect,
  value,
  onChange,
  onClear,
  isLoading = false,
  isTyping = false,
}: AutocompleteProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-9 pr-9 bg-background"
        />

        {value && (
          <button
            onClick={() => {
              onClear();
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && value && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-2 text-sm text-muted-foreground flex items-center justify-center">
              <span className="animate-pulse">Loading...</span>
            </div>
          ) : data.length > 0 ? (
            <ul className="py-1">
              {data.map((item, index) => (
                <li
                  key={index}
                  className="px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleSelect(item)}
                >
                  {highlightMatch(getDisplayValue(item), value)}
                </li>
              ))}
            </ul>
          ) : isTyping ? null : (
            <ul className="py-1">
              <li
                className="px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors italic flex items-center justify-between"
                onClick={() => handleSelect(value as unknown as T)}
              >
                <span>Search for "{value}"</span>
                <Search className="h-3 w-3 text-muted-foreground ml-2" />
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
