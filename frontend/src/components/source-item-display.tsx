import { useState, type MouseEvent } from "react";
import { Download, Loader2 } from "lucide-react";
import type { SourceItem } from "@/types";
import { AnswerService } from "@/hooks/services/answerService";

const answerService = new AnswerService();

interface SourceItemDisplayProps {
  source: SourceItem;
  className?: string;
}

export const SourceItemDisplay = ({
  source,
  className,
}: SourceItemDisplayProps) => {
  const [downloading, setDownloading] = useState(false);

  const isUploaded = Boolean(source.uploadedDocument);
  const displayText = source.uploadedDocument
    ? source.uploadedDocument.filename
    : source.source;

  const handleDownload = async (
    e: MouseEvent<HTMLAnchorElement>,
  ) => {
    if (!source.uploadedDocument) return;
    e.preventDefault();
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await answerService.downloadDocument(
        source.uploadedDocument.id,
      );
      if (!blob) return;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = source.uploadedDocument.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Download failure is surfaced silently in read-only lists; keep it minimal.
    } finally {
      setDownloading(false);
    }
  };

  if (isUploaded) {
    return (
      <a
        href={source.source}
        onClick={handleDownload}
        className={`inline-flex items-center gap-1.5 truncate text-primary hover:text-primary/80 hover:underline ${className ?? ""}`}
        title={`Download ${displayText}`}
      >
        <span className="truncate">{displayText}</span>
        {downloading ? (
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5 flex-shrink-0" />
        )}
      </a>
    );
  }

  return (
    <a
      href={source.source}
      target="_blank"
      rel="noopener noreferrer"
      className={`truncate text-primary hover:text-primary/80 hover:underline ${className ?? ""}`}
      title={source.source}
    >
      {displayText}
    </a>
  );
};
