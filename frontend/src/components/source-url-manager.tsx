import { PlusCircle, X } from "lucide-react";
import { Input } from "./atoms/input";
import { useState, type KeyboardEvent } from "react";
import { ScrollArea } from "./atoms/scroll-area";
import {toast} from "sonner";

interface SourceUrlManagerProps {
  sources: string[];
  onSourcesChange: (sources: string[]) => void;
  className?: string;
}

export const SourceUrlManager = ({
  sources,
  onSourcesChange,
  className,
}: SourceUrlManagerProps) => {
  const [inputValue, setInputValue] = useState("");

  const addSource = () => {
    const trimmedValue = inputValue.trim();
    try {
      new URL(trimmedValue);
    } catch {
      toast.error("Please enter a valid URL before adding a new one.");
      return;
    }
    if (trimmedValue && sources.includes(trimmedValue)) {
      toast.error("This URL already added, try adding new one.");
    } else {
      onSourcesChange([...sources, trimmedValue]);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSource();
    }
  };

  const removeSource = (index: number) => {
    onSourcesChange(sources.filter((_, idx) => idx !== index));
  };

  return (
    <div className={`grid gap-3 ${className}`}>
      <label className="text-sm font-medium text-foreground">Source URLs</label>

      <div className="space-y-3">
        {/* Input */}
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="https://example.com"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <button
            type="button"
            onClick={addSource}
            className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <PlusCircle className="h-5 w-5" />
          </button>
        </div>

        {sources.length > 0 && (
          <ScrollArea className="h-[4.5rem] rounded-lg border p-2">
            <div className="flex flex-wrap gap-2">
              {sources.map((source, idx) => (
                <div
                  key={idx}
                  className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-tag border border-tag-border rounded-lg text-sm text-tag-foreground hover:bg-tag-hover transition-colors"
                >
                  <span className="max-w-[200px] truncate" title={source}>
                    {source}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSource(idx)}
                    className="flex-shrink-0 text-tag-foreground/60 hover:text-tag-foreground transition-colors"
                    aria-label="Remove source"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
