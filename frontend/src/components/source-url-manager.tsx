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

  const isPdfLink = (url: string) => {
    const lower = url.toLowerCase();
    return lower.includes("zoho") || lower.includes(".pdf");
  };

  const parsePages = (input: string): number[] => {
    return input
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1);
  };

  const addSource = () => {
    if (!selectedType) {
      toast.error("Please select a source type.");
      return;
    }

    if (!sourceName.trim()) {
      toast.error("Please enter the source name.");
      return;
    }

    const trimmedUrl = urlInput.trim();

    if (!trimmedUrl) {
      toast.error("Please enter the source URL.");
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      toast.error("Please enter a valid URL.");
      return;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const isZohoWorkDrive =
      hostname.includes("zoho") && hostname.includes("workdrive");

    if (!isZohoWorkDrive) {
      toast.error("Only Zoho WorkDrive URLs are allowed.");
      return;
    }

    if (!pageInput.trim()) {
      toast.error("Page number is required for PDF/document links.");
      return;
    }

    const pages = parsePages(pageInput);
    if (pages.length === 0) {
      toast.error("Please enter valid page numbers (e.g. 1, 2, 5).");
      return;
    }

    const exists = sources.some(
      (item) =>
        item.sourceType === selectedType &&
        item.source === trimmedUrl,
    );
    if (exists) {
      toast.error("This source already exists.");
      return;
    }

    onSourcesChange([
      ...sources,
      {
        sourceType: selectedType,
        sourceName: sourceName.trim(),
        source: trimmedUrl,
        page: pages,
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

        {/* Source Name & URL fields */}
        {selectedType && (
          <div className="space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <Input
              type="text"
              placeholder={`${SOURCE_TYPE_LABELS[selectedType]} Source Name`}
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full"
            />
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
                type="text"
                placeholder="Pages e.g. 1,2,5"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-36"
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
                  className="grid grid-cols-[140px_1fr_auto_auto] items-center gap-6 px-3 py-2 bg-tag border border-tag-border rounded-lg text-sm text-tag-foreground hover:bg-tag-hover transition-colors"
                >
                  {/* Column 1: Source Type Badge */}
                  {item.sourceType ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-foreground/10 text-foreground border border-foreground/20 whitespace-nowrap overflow-x-auto">
                      {(() => {
                        const label = SOURCE_TYPE_LABELS[item.sourceType!] || item.sourceType;
                        return item.sourceName && item.sourceName.toLowerCase() !== (label || '').toLowerCase()
                          ? `${label}: ${item.sourceName}`
                          : label;
                      })()}
                    </span>
                  ) : (
                    <span />
                  )}

                  {/* Column 2: Link */}
                  <span className="truncate" title={item.source}>
                    {item.source}
                  </span>

                  {/* Column 3: Page Numbers */}
                  {item.page && item.page.length > 0 ? (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      pg {item.page.join(", ")}
                    </span>
                  ) : (
                    <span />
                  )}

                  {/* Column 4: Remove Button */}
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
