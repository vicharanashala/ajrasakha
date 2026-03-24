import { PlusCircle, X } from "lucide-react";
import { Input } from "./atoms/input";
import { useState, type KeyboardEvent } from "react";
import { ScrollArea } from "./atoms/scroll-area";
import { toast } from "sonner";
import type { SourceItem, SourceType } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "hyper_local", label: "Hyper Local" },
  { value: "state", label: "State" },
  { value: "central", label: "Central" },
  { value: "other", label: "Other" },
];

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  hyper_local: "Hyper Local",
  state: "State",
  central: "Central",
  other: "Other",
};

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
  const [selectedType, setSelectedType] = useState<SourceType | "">("");
  const [sourceName, setSourceName] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [pageInput, setPageInput] = useState("");

  const addSource = () => {
    if (!selectedType) {
      toast.error("Please select a source type.");
      return;
    }

    if (selectedType === "other" && !sourceName.trim()) {
      toast.error("Please enter the source name.");
      return;
    }

    const trimmedUrl = urlInput.trim();
    const pageNum = pageInput ? Number(pageInput) : undefined;

    try {
      new URL(trimmedUrl);
    } catch {
      toast.error("Please enter a valid URL.");
      return;
    }

    if (pageNum !== undefined && (isNaN(pageNum) || pageNum < 1)) {
      toast.error("Please enter a valid page number (1 or greater).");
      return;
    }

    const exists = sources.some(
      (item) =>
        item.sourceType === selectedType &&
        item.source === trimmedUrl &&
        item.page === pageNum
    );
    if (exists) {
      toast.error("This source already exists.");
      return;
    }

    onSourcesChange([
      ...sources,
      {
        sourceType: selectedType,
        sourceName: selectedType === "other" ? sourceName.trim() : undefined,
        source: trimmedUrl,
        page: pageNum,
      },
    ]);
    setSelectedType("");
    setSourceName("");
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
        {/* Source Type Dropdown */}
        <Select
          value={selectedType}
          onValueChange={(val) => setSelectedType(val as SourceType)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select Source Type" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Source Name (only for Other) & URL fields */}
        {selectedType && (
          <div className="space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            {selectedType === "other" && (
              <Input
                type="text"
                placeholder="Other Source Name"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full"
              />
            )}
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder={`${SOURCE_TYPE_LABELS[selectedType]} Source Link URL`}
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
          </div>
        )}

        {/* Added sources list */}
        {sources.length > 0 && (
          <ScrollArea className="h-[7rem] rounded-lg border p-2">
            <div className="flex flex-col gap-2">
              {sources.map((item, idx) => (
                <div
                  key={idx}
                  className="group inline-flex items-center gap-2 px-3 py-1.5 bg-tag border border-tag-border rounded-lg text-sm text-tag-foreground hover:bg-tag-hover transition-colors"
                >
                  {item.sourceType && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      {SOURCE_TYPE_LABELS[item.sourceType] || item.sourceType}
                    </span>
                  )}
                  {item.sourceName && (
                    <span className="font-medium truncate max-w-[120px]" title={item.sourceName}>
                      {item.sourceName}
                    </span>
                  )}
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
                    className="flex-shrink-0 ml-auto text-tag-foreground/60 hover:text-tag-foreground transition-colors"
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
