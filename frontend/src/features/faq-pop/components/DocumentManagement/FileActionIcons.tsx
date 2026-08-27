// @ts-nocheck
import { toast } from "sonner";
import { Eye, Link2, Download, Trash2 } from "lucide-react";

// Shared eye/copy/download(/delete) icon row for a file reference (original/translation/review
// columns, spec §6). Backend API changes (2026-08-24): `zoho_file_id` is no longer in any
// response — every file reference is now a direct `*_shareable_link` URL (shareable_link /
// translation_shareable_link / review_shareable_link), always populated once the file exists.
// Renders nothing if there's no link — spec §7's "not yet done" button state covers that, this
// component is only for the "done" state.
export default function FileActionIcons({ shareableLink, onDelete, deleting }) {
  if (!shareableLink) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareableLink);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
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
      <a
        className="p-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer inline-flex"
        href={shareableLink}
        download
        title="Download"
      >
        <Download size={11} />
      </a>
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
