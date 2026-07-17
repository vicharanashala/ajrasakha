import { useRef, useState } from "react";
import { Images, Loader2, Trash2, Upload, Video, Youtube } from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
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
  const { mutateAsync: remove, isPending: deleting } = useDeleteMedia();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // YouTube videos are an outreach-video option only.
  const allowYoutube = kind === "outreach_video";

  const items: MediaItem[] = data ?? [];

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await upload({ kind, file, title: title || undefined });
    setTitle("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const onAddYoutube = async () => {
    if (!youtubeUrl.trim()) return;
    await addYoutube({ url: youtubeUrl.trim(), title: title || undefined });
    setYoutubeUrl("");
    setTitle("");
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
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
                <p className="truncate text-xs font-medium" title={m.title || m.storagePath}>
                  {m.title || (m.source === "youtube" ? "YouTube video" : m.storagePath?.split("/").pop())}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {m.source === "youtube" ? "YouTube" : prettySize(m.size ?? 0)}
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
    </section>
  );
};
