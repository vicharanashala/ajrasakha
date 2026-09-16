// @ts-nocheck
import { useState } from "react";
import { toast } from "sonner";
import { Eye, Link2, Download, Loader2, Trash2 } from "lucide-react";
import { getFileDownloadUrl } from "../../api";

// Shared eye/copy/download(/delete) icon row for a file reference (original/translation/review
// columns). `shareableLink` is always an external (Zoho WorkDrive) URL — a plain `<a download>`
// only honors the `download` attribute for same-origin URLs, so on a cross-origin link the
// browser just navigates there instead of saving the file. Download instead fetches a blob and
// saves it from a same-origin blob: URL, which actually triggers a save with no navigation.
//
// When `fileId` is given, the fetch targets the backend's own download proxy
// (GET /dashboard/files/{fileId}/download — sends Allow-Origin: *, Content-Length, and supports
// Range requests for large files) instead of the raw Zoho link — no CORS dependency on Zoho, and
// no login-wall since `shareableLink`/`*_shareable_link` open Zoho's own viewer and demand a Zoho
// login. Every downloadable file (original via `representative_file_id`, translation via
// `translation_file_id`, review via `review_file_id`) now has a fileId. Without one, it falls
// back to fetching `shareableLink` directly, which only works if Zoho's own CORS policy allows
// it; either way, a failed fetch falls back to opening the link in a new tab with a toast
// explaining why. Renders nothing if there's no link — the "not yet done" button state covers
// that, this component is only for the "done" state.
export default function FileActionIcons({ shareableLink, fileId, filename, onDelete, deleting }) {
  const [downloading, setDownloading] = useState(false);
  if (!shareableLink) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareableLink);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(fileId ? getFileDownloadUrl(fileId) : shareableLink);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename || shareableLink.split("/").pop() || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error("Couldn't download directly — opening the file instead");
      window.open(shareableLink, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <a
        className="p-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer inline-flex"
        href={shareableLink}
        target="_blank"
        rel="noopener noreferrer"
        title="View"
      >
        <Eye size={11} />
      </a>
      <button
        className="p-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
        onClick={handleCopy}
        title="Copy link"
      >
        <Link2 size={11} />
      </button>
      <button
        className="p-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer disabled:opacity-40"
        onClick={handleDownload}
        disabled={downloading}
        title="Download"
      >
        {downloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
      </button>
      {onDelete && (
        <button
          className={`p-1 rounded border transition-colors cursor-pointer
            ${deleting
              ? "border-border/40 text-muted-foreground/30 cursor-not-allowed"
              : "border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5"}`}
          onClick={onDelete}
          disabled={deleting}
          title="Delete file"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}
