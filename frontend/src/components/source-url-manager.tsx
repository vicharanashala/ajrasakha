import { PlusCircle, X } from "lucide-react";
import { Input } from "./atoms/input";
import { useState, type KeyboardEvent } from "react";
import { ScrollArea } from "./atoms/scroll-area";
import { toast } from "sonner";
import type { SourceItem } from "@/types";

interface SourceUrlManagerProps {
  sources: SourceItem[];
  onSourcesChange: (sources: SourceItem[]) => void;
  className?: string;
}

export const SourceUrlManager = ({
  sources,
  onSourcesChange,
  className,
}: SourceUrlManagerProps) => {
  const [urlInput, setUrlInput] = useState("");
  const [pageInput, setPageInput] = useState("");

  const addSource = () => {
    const trimmedUrl = urlInput.trim();
    const pageNum = pageInput ? Number(pageInput) : undefined;

    try {
      new URL(trimmedUrl);
    } catch {
      toast.error("Please enter a valid URL before adding.");
      return;
    }

    if (pageNum !== undefined && (isNaN(pageNum) || pageNum < 1)) {
      toast.error("Please enter a valid page number (1 or greater).");
      return;
    }

    const exists = sources.some(
      (item) => item.source === trimmedUrl && item.page === pageNum
    );
    if (exists) {
      toast.error("This source already exists.");
      return;
    }

    onSourcesChange([...sources, { source: trimmedUrl, page: pageNum }]);
    setUrlInput("");
    setPageInput("");
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
      <label className="text-sm font-medium text-foreground">
        Source References *
      </label>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="https://example.com"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Input
            type="number"
            placeholder="Page"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-24"
            min={1}
          />
          <button
            type="button"
            onClick={addSource}
            className="px-3 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <PlusCircle className="h-5 w-5" />
          </button>
        </div>

        {sources.length > 0 && (
          <ScrollArea className="h-[5rem] rounded-lg border p-2">
            <div className="flex flex-wrap gap-2">
              {sources.map((item, idx) => (
                <div
                  key={idx}
                  className="group inline-flex items-center gap-2 px-3 py-1.5 bg-tag border border-tag-border rounded-lg text-sm text-tag-foreground hover:bg-tag-hover transition-colors"
                >
                  <span className="max-w-[200px] truncate" title={item.source}>
                    {item.source}
                  </span>
                  {item.page && (
                    <span className="text-xs text-muted-foreground">
                      (p.{item.page})
                    </span>
                  )}
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
