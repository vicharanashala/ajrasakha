import { useRef, useState } from "react";
import { Images, Link as LinkIcon, Loader2, Trash2, Upload, Video, Youtube } from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import {
  useAddImageLink,
  useAddYoutube,
  useDeleteMedia,
  useGetMedia,
  useUploadMedia,
} from "@/hooks/api/media/useMedia";
import type { MediaItem, MediaKind } from "@/hooks/services/mediaService";

const SECTIONS: {
  kind: MediaKind;
  label: string;
  hint: string;
  accept: string;
  icon: typeof Images;
}[] = [
  {
    kind: "carousel",
    label: "Carousel Images",
    hint: "Hero slides on the public dashboard",
    accept: "image/*",
    icon: Images,
  },
  {
    kind: "outreach_image",
    label: "Outreach Images",
    hint: "Field photographs from outreach programmes",
    accept: "image/*",
    icon: Images,
  },
  {
    kind: "outreach_video",
    label: "Outreach Videos",
    hint: "Field videos — uploaded directly to the bucket, no size limit",
    accept: "video/*",
    icon: Video,
  },
];

const isVideoKind = (kind: MediaKind) => kind === "outreach_video";

/** What the details dialog is about to add. */
type Pending =
  | { type: "file"; file: File; previewUrl: string }
  | { type: "youtube"; url: string }
  | { type: "link"; url: string };

const prettySize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Admin/moderator media library for the public dashboard. Files are uploaded to the
 * media bucket (GCS) via the API; deleting removes both the bucket object and the
 * record, so an admin can replace a file by deleting the old one and uploading a new one.
 */
export const MediaManager = () => {
  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Dashboard Media</h1>
        <p className="text-sm text-muted-foreground">
          Upload carousel images, outreach photos and outreach videos shown on the public
          dashboard. Delete a file to remove it, then upload a replacement.
        </p>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((s) => (
          <MediaSection key={s.kind} {...s} />
        ))}
      </div>
    </div>
  );
};

const MediaSection = ({
  kind,
  label,
  hint,
  accept,
  icon: Icon,
}: {
  kind: MediaKind;
  label: string;
  hint: string;
  accept: string;
  icon: typeof Images;
}) => {
  const { data, isLoading } = useGetMedia(kind);
  const { mutateAsync: upload, isPending: uploading, progress } = useUploadMedia();
  const { mutateAsync: addYoutube, isPending: addingYoutube } = useAddYoutube();
  const { mutateAsync: addImageLink, isPending: addingLink } = useAddImageLink();
  const { mutateAsync: remove, isPending: deleting } = useDeleteMedia();
  const inputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  // Everything (file upload, YouTube URL, image URL) goes through ONE details dialog that
  // asks for the item's OWN title + caption, so each can be described separately.
  const [pending, setPending] = useState<Pending | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");

  // YouTube videos are an outreach-video option; image links apply to the image kinds.
  const allowYoutube = kind === "outreach_video";
  const allowImageLink = kind === "carousel" || kind === "outreach_image";

  const busy = uploading || addingYoutube || addingLink;
  const items: MediaItem[] = data ?? [];

  const openDialog = (p: Pending) => {
    setPending(p);
    setTitle("");
    setCaption("");
  };

  // File chosen → open the details dialog (don't upload yet).
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = ""; // allow re-picking the same file later
    if (!file) return;
    openDialog({ type: "file", file, previewUrl: URL.createObjectURL(file) });
  };

  const onAddYoutube = () => {
    if (!youtubeUrl.trim()) return;
    openDialog({ type: "youtube", url: youtubeUrl.trim() });
  };

  const onAddImageLink = () => {
    if (!imageUrl.trim()) return;
    openDialog({ type: "link", url: imageUrl.trim() });
  };

  const closeDialog = () => {
    if (pending?.type === "file") URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
    setTitle("");
    setCaption("");
  };

  // Confirm → run the right add with this item's own title/caption.
  const onConfirm = async () => {
    if (!pending) return;
    const meta = { title: title.trim() || undefined, caption: caption.trim() || undefined };

    if (pending.type === "file") {
      await upload({ kind, file: pending.file, ...meta });
    } else if (pending.type === "youtube") {
      await addYoutube({ url: pending.url, ...meta });
      setYoutubeUrl("");
    } else {
      await addImageLink({ kind, url: pending.url, ...meta });
      setImageUrl("");
    }
    closeDialog();
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">{label}</h2>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={onPick}
            className="hidden"
          />
          <Button
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="gap-2"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? `Uploading… ${progress}%` : "Upload"}
          </Button>
        </div>
      </div>

      {uploading && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {allowYoutube && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Paste a YouTube URL…"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={addingYoutube || !youtubeUrl.trim()}
            onClick={onAddYoutube}
            className="gap-2"
          >
            {addingYoutube ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Youtube className="h-4 w-4" />
            )}
            Add YouTube
          </Button>
        </div>
      )}

      {allowImageLink && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Paste an image URL…"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={addingLink || !imageUrl.trim()}
            onClick={onAddImageLink}
            className="gap-2"
          >
            {addingLink ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LinkIcon className="h-4 w-4" />
            )}
            Add image link
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing uploaded yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((m) => (
            <div key={m._id} className="group relative overflow-hidden rounded-md border">
              {m.source === "youtube" ? (
                <img
                  src={`https://img.youtube.com/vi/${m.youtubeId}/hqdefault.jpg`}
                  alt={m.title || "YouTube video"}
                  className="h-32 w-full bg-black object-cover"
                />
              ) : m.mimeType?.startsWith("video/") ? (
                <video src={m.url} controls className="h-32 w-full bg-black object-cover" />
              ) : (
                <img src={m.url} alt={m.title || label} className="h-32 w-full object-cover" />
              )}
              <div className="p-2">
                <p className="truncate text-xs font-medium" title={m.title || m.url}>
                  {m.title ||
                    (m.source === "youtube"
                      ? "YouTube video"
                      : m.source === "link"
                        ? "Image link"
                        : m.storagePath?.split("/").pop())}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {m.source === "youtube"
                    ? "YouTube"
                    : m.source === "link"
                      ? "External link"
                      : prettySize(m.size ?? 0)}
                </p>
              </div>
              <Button
                variant="destructive"
                size="icon"
                disabled={deleting}
                onClick={() => remove(m._id)}
                aria-label="Delete"
                className="absolute right-1 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Details dialog: prompt for THIS item's title + caption before adding it. */}
      <Dialog open={!!pending} onOpenChange={(open) => !open && !busy && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Describe this {isVideoKind(kind) ? "video" : "image"}
            </DialogTitle>
            <DialogDescription>
              Add a title and caption. They appear with it on the public dashboard.
            </DialogDescription>
          </DialogHeader>

          {pending?.type === "file" &&
            (isVideoKind(kind) ? (
              <video src={pending.previewUrl} controls className="max-h-48 w-full rounded-md bg-black object-contain" />
            ) : (
              <img src={pending.previewUrl} alt="Preview" className="max-h-48 w-full rounded-md object-contain" />
            ))}
          {pending?.type === "link" && (
            <img src={pending.url} alt="Preview" className="max-h-48 w-full rounded-md object-contain" />
          )}
          {pending?.type === "youtube" && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Youtube className="h-4 w-4 shrink-0" />
              <span className="truncate" title={pending.url}>{pending.url}</span>
            </div>
          )}

          <div className="space-y-3">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {pending?.type === "file" && (
              <p className="truncate text-[11px] text-muted-foreground" title={pending.file.name}>
                {pending.file.name}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={busy} className="gap-2">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? `Uploading… ${progress}%` : busy ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
