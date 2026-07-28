import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, ImagePlus, LayoutDashboard, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import {
  useAddPublicDashboardItem,
  useDeletePublicDashboardItem,
  usePublicDashboardItems,
  useUpdatePublicDashboardItem,
} from "@/hooks/api/public-dashboard/usePublicDashboardConfig";
import {
  OUTREACH_IMAGE_NAME,
  OUTREACH_VIDEO_NAME,
  SATURATION_LIMIT_NAME,
} from "@/hooks/services/publicDashboardService";

/** Shape stored in the `value` field of every outreach video item. */
interface VideoValue {
  url: string;
  place?: string;
  title?: string;
  body?: string;
  reach?: string;
  outcome?: string;
}

/** Parse a video item's `value` — handles both legacy plain strings and new objects. */
function parseVideoValue(raw: unknown): VideoValue {
  if (typeof raw === "string") return { url: raw };
  if (raw && typeof raw === "object") {
    const v = raw as Record<string, unknown>;
    return {
      url: String(v.url ?? v.videoUrl ?? ""),
      place: v.place ? String(v.place) : undefined,
      title: v.title ? String(v.title) : undefined,
      body: v.body ? String(v.body) : undefined,
      reach: v.reach ? String(v.reach) : undefined,
      outcome: v.outcome ? String(v.outcome) : undefined,
    };
  }
  return { url: "" };
}

/** Keep it lean: if no text fields are filled, store just the URL string. */
function buildVideoValue(fields: VideoValue): VideoValue | string {
  const hasExtra =
    fields.place || fields.title || fields.body || fields.reach || fields.outcome;
  if (!hasExtra) return fields.url;
  const out: VideoValue = { url: fields.url };
  if (fields.place) out.place = fields.place;
  if (fields.title) out.title = fields.title;
  if (fields.body) out.body = fields.body;
  if (fields.reach) out.reach = fields.reach;
  if (fields.outcome) out.outcome = fields.outcome;
  return out;
}

const EMPTY_NEW_VIDEO: VideoValue = { url: "", place: "", title: "", body: "", reach: "", outcome: "" };

/**
 * Admin-only editor for the public dashboard. Every value lives in one `items` array and
 * is managed through a single add/update/delete API: the crop saturation limit (a single
 * item) and the outreach video URLs (many items with the same name).
 */
export const EditPublicDashboardModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data: items, isLoading } = usePublicDashboardItems();
  const { mutateAsync: addItem, isPending: adding } =
    useAddPublicDashboardItem();
  const { mutateAsync: updateItem, isPending: updating } =
    useUpdatePublicDashboardItem();
  const { mutateAsync: deleteItem } = useDeletePublicDashboardItem();

  const saturationItem = useMemo(
    () => items?.find((i) => i.name === SATURATION_LIMIT_NAME),
    [items],
  );
  const videos = useMemo(
    () => items?.filter((i) => i.name === OUTREACH_VIDEO_NAME) ?? [],
    [items],
  );
  const images = useMemo(
    () => items?.filter((i) => i.name === OUTREACH_IMAGE_NAME) ?? [],
    [items],
  );

  const [saturationLimit, setSaturationLimit] = useState<string>("");
  const [newVideo, setNewVideo] = useState<VideoValue>(EMPTY_NEW_VIDEO);
  const [newVideoExpanded, setNewVideoExpanded] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");
  // Per-item edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<VideoValue>({ url: "" });
  const [editExpanded, setEditExpanded] = useState(false);

  // Seed the saturation input from the saved item whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (saturationItem?.value !== undefined && saturationItem?.value !== null) {
      setSaturationLimit(String(saturationItem.value));
    }
  }, [open, saturationItem?.value]);

  const handleSaveSaturation = async () => {
    const value = Number(saturationLimit);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Saturation limit must be a non-negative number.");
      return;
    }
    try {
      if (saturationItem) {
        await updateItem({ id: saturationItem.id, patch: { value } });
      } else {
        await addItem({ name: SATURATION_LIMIT_NAME, value });
      }
      toast.success("Saturation limit updated.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update saturation limit.");
    }
  };

  const handleAddVideo = async () => {
    const url = newVideo.url.trim();
    if (!url) {
      toast.error("Enter a video URL.");
      return;
    }
    try {
      const value = buildVideoValue({ ...newVideo, url });
      await addItem({ name: OUTREACH_VIDEO_NAME, value });
      setNewVideo(EMPTY_NEW_VIDEO);
      setNewVideoExpanded(false);
      toast.success("Outreach video added.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add video.");
    }
  };

  const handleSaveEdit = async (id: string) => {
    const url = editingValue.url.trim();
    if (!url) {
      toast.error("URL cannot be empty.");
      return;
    }
    try {
      const value = buildVideoValue({ ...editingValue, url });
      await updateItem({ id, patch: { value } });
      setEditingId(null);
      setEditingValue({ url: "" });
      setEditExpanded(false);
      toast.success("Updated.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update.");
    }
  };

  const handleDeleteVideo = async (id: string) => {
    try {
      await deleteItem(id);
      toast.success("Outreach video deleted.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete video.");
    }
  };

  const handleAddImage = async () => {
    const url = newImageUrl.trim();
    if (!url) {
      toast.error("Enter an image URL.");
      return;
    }
    try {
      await addItem({ name: OUTREACH_IMAGE_NAME, value: url });
      setNewImageUrl("");
      toast.success("Outreach image added.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add image.");
    }
  };

  const handleDeleteImage = async (id: string) => {
    try {
      await deleteItem(id);
      toast.success("Outreach image deleted.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete image.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[90vw] sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden="true" />
            Edit Public Dashboard
          </DialogTitle>
          <DialogDescription>
            Update the values shown on the public dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Crop Saturation Limit */}
          <div className="space-y-1.5">
            <Label htmlFor="saturation-limit">Crop Saturation Limit</Label>
            <p className="text-xs text-muted-foreground">
              A (state, crop) pair with more questions than this is shown as
              "saturated" on the public dashboard.
            </p>
            <div className="flex items-center gap-2">
              <Input
                id="saturation-limit"
                type="number"
                min={0}
                value={saturationLimit}
                onChange={(e) => setSaturationLimit(e.target.value)}
                placeholder={isLoading ? "Loading..." : "e.g. 50"}
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={handleSaveSaturation}
                disabled={updating || adding || isLoading || saturationLimit === ""}
              >
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Save
              </Button>
            </div>
          </div>

          {/* Outreach Videos */}
          <div className="space-y-2">
            <Label>Outreach Videos</Label>
            <p className="text-xs text-muted-foreground">
              Add YouTube video URLs with optional story text to feature on the
              public dashboard. Text content appears beside the video.
            </p>

            {/* Add new video form */}
            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  value={newVideo.url}
                  onChange={(e) => setNewVideo((v) => ({ ...v, url: e.target.value }))}
                  placeholder="YouTube URL — https://youtube.com/watch?v=..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddVideo();
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleAddVideo}
                  disabled={adding || !newVideo.url.trim()}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>

              {/* Expandable text content fields */}
              <button
                type="button"
                onClick={() => setNewVideoExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {newVideoExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Text content (optional — shown beside the video)
              </button>

              {newVideoExpanded && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs">Location label</Label>
                    <Input
                      value={newVideo.place ?? ""}
                      onChange={(e) => setNewVideo((v) => ({ ...v, place: e.target.value }))}
                      placeholder="e.g. Godavari Basin, Andhra Pradesh"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Card heading / title</Label>
                    <Input
                      value={newVideo.title ?? ""}
                      onChange={(e) => setNewVideo((v) => ({ ...v, title: e.target.value }))}
                      placeholder="e.g. Early Paddy Blast Warning"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Story body text</Label>
                    <Textarea
                      value={newVideo.body ?? ""}
                      onChange={(e) => setNewVideo((v) => ({ ...v, body: e.target.value }))}
                      placeholder="A short description of the outreach story…"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Farmers reached</Label>
                    <Input
                      value={newVideo.reach ?? ""}
                      onChange={(e) => setNewVideo((v) => ({ ...v, reach: e.target.value }))}
                      placeholder="e.g. 4,200+"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Actions completed</Label>
                    <Input
                      value={newVideo.outcome ?? ""}
                      onChange={(e) => setNewVideo((v) => ({ ...v, outcome: e.target.value }))}
                      placeholder="e.g. 1,150"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Existing videos list */}
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading videos...</p>
              ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach videos yet.</p>
              ) : (
                videos.map((video) => {
                  const parsed = parseVideoValue(video.value);
                  const isEditing = editingId === video.id;

                  return (
                    <div
                      key={video.id}
                      className="rounded-md border border-border p-3 space-y-2"
                    >
                      {isEditing ? (
                        <>
                          {/* Edit mode — URL row */}
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingValue.url}
                              onChange={(e) =>
                                setEditingValue((v) => ({ ...v, url: e.target.value }))
                              }
                              placeholder="YouTube URL"
                              className="flex-1"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleSaveEdit(video.id)}
                              aria-label="Save"
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null);
                                setEditingValue({ url: "" });
                                setEditExpanded(false);
                              }}
                              aria-label="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setEditExpanded((v) => !v)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {editExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                            Text content (optional)
                          </button>

                          {editExpanded && (
                            <div className="grid grid-cols-2 gap-3 pt-1">
                              <div className="space-y-1">
                                <Label className="text-xs">Location label</Label>
                                <Input
                                  value={editingValue.place ?? ""}
                                  onChange={(e) =>
                                    setEditingValue((v) => ({ ...v, place: e.target.value }))
                                  }
                                  placeholder="e.g. Godavari Basin, Andhra Pradesh"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Card heading / title</Label>
                                <Input
                                  value={editingValue.title ?? ""}
                                  onChange={(e) =>
                                    setEditingValue((v) => ({ ...v, title: e.target.value }))
                                  }
                                  placeholder="e.g. Early Paddy Blast Warning"
                                />
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Story body text</Label>
                                <Textarea
                                  value={editingValue.body ?? ""}
                                  onChange={(e) =>
                                    setEditingValue((v) => ({ ...v, body: e.target.value }))
                                  }
                                  placeholder="A short description of the outreach story…"
                                  rows={3}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Farmers reached</Label>
                                <Input
                                  value={editingValue.reach ?? ""}
                                  onChange={(e) =>
                                    setEditingValue((v) => ({ ...v, reach: e.target.value }))
                                  }
                                  placeholder="e.g. 4,200+"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Actions completed</Label>
                                <Input
                                  value={editingValue.outcome ?? ""}
                                  onChange={(e) =>
                                    setEditingValue((v) => ({ ...v, outcome: e.target.value }))
                                  }
                                  placeholder="e.g. 1,150"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {/* View mode */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <a
                                href={parsed.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate text-sm text-primary hover:underline"
                                title={parsed.url}
                              >
                                {parsed.url}
                              </a>
                              {(parsed.place || parsed.title) && (
                                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                  {[parsed.place, parsed.title].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(video.id);
                                setEditingValue(parsed);
                                setEditExpanded(
                                  !!(parsed.place || parsed.title || parsed.body || parsed.reach || parsed.outcome),
                                );
                              }}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteVideo(video.id)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>


          {/* Outreach Images */}
          <div className="space-y-2">
            <Label>Outreach Images</Label>
            <p className="text-xs text-muted-foreground">
              Add outreach image URLs to feature on the public dashboard. You can
              edit or delete them anytime.
            </p>

            {/* Add new */}
            <div className="flex items-center gap-2">
              <Input
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="https://...(image URL)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddImage();
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleAddImage}
                disabled={adding || !newImageUrl.trim()}
              >
                <ImagePlus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>

            {/* List */}
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading outreach images...
                </p>
              ) : images.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No outreach images yet.
                </p>
              ) : (
                images.map((image) => (
                  <div
                    key={image.id}
                    className="flex items-center gap-2 rounded-md border border-border p-2"
                  >
                    {editingId === image.id ? (
                      <>
                        <Input
                          value={editingUrl}
                          onChange={(e) => setEditingUrl(e.target.value)}
                          className="flex-1"
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSaveEdit(image.id)}
                          aria-label="Save"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditingUrl("");
                          }}
                          aria-label="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <img
                          src={String(image.value)}
                          alt=""
                          className="h-10 w-10 flex-shrink-0 rounded object-cover border border-border"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.visibility =
                              "hidden";
                          }}
                        />
                        <a
                          href={String(image.value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 truncate text-sm text-primary hover:underline"
                          title={String(image.value)}
                        >
                          {String(image.value)}
                        </a>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(image.id);
                            setEditingUrl(String(image.value));
                          }}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteImage(image.id)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPublicDashboardModal;
