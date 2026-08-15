import { PlusCircle, X, Upload, FileText, Loader2 } from "lucide-react";
import { Input } from "./atoms/input";
import { useRef, useState, type KeyboardEvent } from "react";
import { ScrollArea } from "./atoms/scroll-area";
import { toast } from "sonner";
import type { SourceItem, SourceType, UploadedDocumentInfo } from "@/types";
import { AnswerService } from "@/hooks/services/answerService";
import { SourceItemDisplay } from "./source-item-display";
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
  MODERATOR_REVIEW: "Moderator Review",
};

const ALLOWED_DOC_EXTENSIONS = [".pdf", ".doc", ".docx"];
const ALLOWED_DOC_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

interface SourceUrlManagerProps {
  sources: SourceItem[];
  onSourcesChange: (sources: SourceItem[]) => void;
  className?: string;
  allowAnyUrl?: boolean;
}

type SourceMode = "url" | "upload";

const answerService = new AnswerService();

export const SourceUrlManager = ({
  sources,
  onSourcesChange,
  className,
  allowAnyUrl = false,
}: SourceUrlManagerProps) => {
  const [selectedType, setSelectedType] = useState<SourceType | "">("");
  const [sourceName, setSourceName] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [pageInput, setPageInput] = useState("");
  const [mode, setMode] = useState<SourceMode>("url");
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPdfLink = (url: string) => /\.pdf($|\?|#)/i.test(url) || /pdf/i.test(url);

  const validatePageInput = (input: string): boolean => {
    const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return false;
    return parts.every((p) => {
      const n = Number(p);
      return Number.isInteger(n) && n >= 1;
    });
  };

  const resetInputs = () => {
    setSelectedType("");
    setSourceName("");
    setUrlInput("");
    setPageInput("");
    setMode("url");
    setSelectedFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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

    if (!allowAnyUrl) {
      const hostname = parsedUrl.hostname.toLowerCase();
      const isZohoWorkDrive =
        hostname.includes("zoho") && hostname.includes("workdrive");

      if (!isZohoWorkDrive) {
        toast.error("Only Zoho WorkDrive URLs are allowed.");
        return;
      }
    }

    const trimmedPage = pageInput.trim();
    const isPdf = isPdfLink(trimmedUrl);

    if (isPdf && !trimmedPage) {
      toast.error("Page number is required for PDF links.");
      return;
    }

    if (trimmedPage && !validatePageInput(trimmedPage)) {
      toast.error("Please enter valid page number(s) (e.g. 1 or 1,2,3).");
      return;
    }

    const pageValue = trimmedPage || undefined;

    const exists = sources.some(
      (item) =>
        item.sourceType === selectedType &&
        item.source === trimmedUrl &&
        item.page === pageValue,
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
        page: pageValue,
      },
    ]);
    resetInputs();
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || !selectedType) {
      toast.error("Please select a source type.");
      return;
    }

    const extensionMatches = ALLOWED_DOC_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext),
    );
    const mimeMatches = ALLOWED_DOC_MIME_TYPES.has(file.type);
    if (!extensionMatches || !mimeMatches) {
      toast.error("Only PDF, DOC and DOCX files are allowed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFileName("");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must not exceed 20MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFileName("");
      return;
    }

    setSelectedFileName(file.name);
    setIsUploading(true);
    try {
      const result = await answerService.uploadDocument(file);
      if (!result?.document) {
        toast.error("Failed to upload document.");
        return;
      }

      const { document } = result;
      const uploadedDocument: UploadedDocumentInfo = document;

      const exists = sources.some(
        (item) => item.uploadedDocument?.id === uploadedDocument.id,
      );
      if (exists) {
        toast.error("This document is already added as a source.");
        return;
      }

      onSourcesChange([
        ...sources,
        {
          sourceType: selectedType,
          sourceName: sourceName.trim() || uploadedDocument.filename,
          source: `/api/answers/documents/${uploadedDocument.id}`,
          uploadedDocument,
        },
      ]);
      resetInputs();
      toast.success("Document uploaded and added as a source.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload document.");
      setSelectedFileName("");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

        {/* Source Name & fields */}
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

            {/* Mode toggle: URL vs Upload */}
            <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
              <button
                type="button"
                onClick={() => setMode("url")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === "url"
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Zoho WorkDrive Link
              </button>
              <button
                type="button"
                onClick={() => setMode("upload")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === "upload"
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upload File
              </button>
            </div>

            {mode === "upload" ? (
              <div className="flex gap-2">
                <label className="flex flex-1 items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:border-primary/60 hover:text-foreground transition-colors">
                  <Upload className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">
                    {selectedFileName || "Choose a PDF, DOC or DOCX file (max 20MB)"}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    data-testid="document-file-input"
                    onChange={(e) =>
                      handleFileSelected(e.target.files?.[0])
                    }
                    disabled={isUploading}
                  />
                </label>
                {isUploading && (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground flex-shrink-0 mt-2" />
                )}
              </div>
            ) : (
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
                  placeholder="Page(s) e.g. 1,2,3"
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
            )}
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

                  {/* Column 2: Link / Uploaded document */}
                  {item.uploadedDocument ? (
                    <span className="flex items-center gap-1.5 truncate">
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <SourceItemDisplay source={item} />
                    </span>
                  ) : (
                    <span className="truncate" title={item.source}>
                      {item.source}
                    </span>
                  )}

                  {/* Column 3: Page Number */}
                  {item.page ? (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      pg {item.page}
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
