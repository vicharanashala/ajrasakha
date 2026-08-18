import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
  Calendar,
} from "lucide-react";
import {
  useAddPublicDashboardItem,
  useDeletePublicDashboardItem,
  usePublicDashboardItems,
  useUpdatePublicDashboardItem,
  useUploadPublicDashboardMedia,
} from "@/hooks/api/public-dashboard/usePublicDashboardConfig";
import {
  FARMERS_FRIDAY_IMAGE_NAME,
  FARMERS_FRIDAY_VIDEO_NAME,
  HOMEPAGE_STATS,
  OUTREACH_IMAGE_NAME,
  OUTREACH_VIDEO_NAME,
  SATURATION_LIMIT_NAME,
} from "@/hooks/services/publicDashboardService";

/** Shape stored in the `value` field of every media item. */
interface MediaValue {
  url: string;
  place?: string;
  title?: string;
  body?: string;
  reach?: string;
  outcome?: string;
}

/** Parse an item's `value` — handles both legacy plain strings and objects. */
function parseMediaValue(raw: unknown): MediaValue {
  if (typeof raw === "string") return { url: raw };
  if (raw && typeof raw === "object") {
    const v = raw as Record<string, unknown>;
    return {
      url: String(v.url ?? v.videoUrl ?? v.imageUrl ?? ""),
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
function buildMediaValue(fields: MediaValue): MediaValue | string {
  const hasExtra =
    fields.place || fields.title || fields.body || fields.reach || fields.outcome;
  if (!hasExtra) return fields.url;
  const out: MediaValue = { url: fields.url };
  if (fields.place) out.place = fields.place;
  if (fields.title) out.title = fields.title;
  if (fields.body) out.body = fields.body;
  if (fields.reach) out.reach = fields.reach;
  if (fields.outcome) out.outcome = fields.outcome;
  return out;
}

const EMPTY_NEW_MEDIA: MediaValue = {
  url: "",
  place: "",
  title: "",
  body: "",
  reach: "",
  outcome: "",
};

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
  const { mutateAsync: uploadMedia, isPending: uploading } =
    useUploadPublicDashboardMedia();

  const outreachImageFileRef = useRef<HTMLInputElement>(null);
  const outreachVideoFileRef = useRef<HTMLInputElement>(null);
  const farmersMediaFileRef = useRef<HTMLInputElement>(null);

  const saturationItem = useMemo(
    () => items?.find((i) => i.name === SATURATION_LIMIT_NAME),
    [items]
  );
  const videos = useMemo(
    () => items?.filter((i) => i.name === OUTREACH_VIDEO_NAME) ?? [],
    [items]
  );
  const images = useMemo(
    () => items?.filter((i) => i.name === OUTREACH_IMAGE_NAME) ?? [],
    [items]
  );
  const farmersFridayMedia = useMemo(
    () =>
      items?.filter(
        (i) =>
          i.name === FARMERS_FRIDAY_IMAGE_NAME ||
          i.name === FARMERS_FRIDAY_VIDEO_NAME
      ) ?? [],
    [items]
  );

  const [saturationLimit, setSaturationLimit] = useState<string>("");
  const [statValues, setStatValues] = useState<Record<string, string>>({});

  // New outreach video state
  const [newVideo, setNewVideo] = useState<MediaValue>(EMPTY_NEW_MEDIA);
  const [newVideoExpanded, setNewVideoExpanded] = useState(false);

  // New outreach image state
  const [newImage, setNewImage] = useState<MediaValue>(EMPTY_NEW_MEDIA);
  const [newImageExpanded, setNewImageExpanded] = useState(false);

  // New Farmers Friday media state
  const [newFarmersMedia, setNewFarmersMedia] = useState<MediaValue>(EMPTY_NEW_MEDIA);
  const [newFarmersKind, setNewFarmersKind] = useState<"image" | "video">("image");
  const [newFarmersExpanded, setNewFarmersExpanded] = useState(false);

  // Per-item edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<MediaValue>({ url: "" });
  const [editExpanded, setEditExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (saturationItem?.value !== undefined && saturationItem?.value !== null) {
      setSaturationLimit(String(saturationItem.value));
    }
  }, [open, saturationItem?.value]);

  useEffect(() => {
    if (!open) return;
    const seeded: Record<string, string> = {};
    for (const stat of HOMEPAGE_STATS) {
      const item = items?.find((i) => i.name === stat.name);
      seeded[stat.name] =
        item?.value !== undefined && item?.value !== null
          ? String(item.value)
          : stat.defaultValue;
    }
    setStatValues(seeded);
  }, [open, items]);

  const handleSaveStats = async () => {
    try {
      let changed = 0;
      for (const stat of HOMEPAGE_STATS) {
        const value = (statValues[stat.name] ?? "").trim();
        if (!value) continue;
        const existing = items?.find((i) => i.name === stat.name);
        if (existing) {
          if (String(existing.value ?? "") === value) continue;
          await updateItem({ id: existing.id, patch: { value } });
          changed++;
        } else {
          await addItem({ name: stat.name, value });
          changed++;
        }
      }
      toast.success(
        changed > 0 ? "Homepage statistics updated." : "No changes to save."
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to update statistics.");
    }
  };

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
      const value = buildMediaValue({ ...newVideo, url });
      await addItem({ name: OUTREACH_VIDEO_NAME, value });
      setNewVideo(EMPTY_NEW_MEDIA);
      setNewVideoExpanded(false);
      toast.success("Outreach video added.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add video.");
    }
  };

  const handleAddImage = async () => {
    const url = newImage.url.trim();
    if (!url) {
      toast.error("Enter an image URL.");
      return;
    }
    try {
      const value = buildMediaValue({ ...newImage, url });
      await addItem({ name: OUTREACH_IMAGE_NAME, value });
      setNewImage(EMPTY_NEW_MEDIA);
      setNewImageExpanded(false);
      toast.success("Outreach image added.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add image.");
    }
  };

  const handleAddFarmersMedia = async () => {
    const url = newFarmersMedia.url.trim();
    if (!url) {
      toast.error("Enter a media URL.");
      return;
    }
    try {
      const name =
        newFarmersKind === "video"
          ? FARMERS_FRIDAY_VIDEO_NAME
          : FARMERS_FRIDAY_IMAGE_NAME;
      const value = buildMediaValue({ ...newFarmersMedia, url });
      await addItem({ name, value });
      setNewFarmersMedia(EMPTY_NEW_MEDIA);
      setNewFarmersExpanded(false);
      toast.success("Farmers' Friday media added.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add Farmers' Friday media.");
    }
  };

  const handleUploadFile = async (
    file: File | undefined,
    type: "image" | "video",
    itemName?: string
  ) => {
    if (!file) return;
    try {
      await uploadMedia({ file, type, name: itemName });
      toast.success(`Media file uploaded successfully.`);
    } catch (error: any) {
      toast.error(error?.message || `Failed to upload ${type}.`);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const url = editingValue.url.trim();
    if (!url) {
      toast.error("URL cannot be empty.");
      return;
    }
    try {
      const value = buildMediaValue({ ...editingValue, url });
      await updateItem({ id, patch: { value } });
      setEditingId(null);
      setEditingValue({ url: "" });
      setEditExpanded(false);
      toast.success("Updated successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update item.");
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteItem(id);
      toast.success("Item deleted.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete item.");
    }
  };

  const renderTextContentFields = (
    value: MediaValue,
    setValue: React.Dispatch<React.SetStateAction<MediaValue>>
  ) => (
    <div className="grid grid-cols-2 gap-3 pt-1">
      <div className="space-y-1">
        <Label className="text-xs">Location / Phase label</Label>
        <Input
          value={value.place ?? ""}
          onChange={(e) =>
            setValue((v) => ({ ...v, place: e.target.value }))
          }
          placeholder="e.g. Godavari Basin, Andhra Pradesh or PHASE 1: LISTEN"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Card heading / title</Label>
        <Input
          value={value.title ?? ""}
          onChange={(e) =>
            setValue((v) => ({ ...v, title: e.target.value }))
          }
          placeholder="e.g. Ground-Zero Connect"
        />
      </div>
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">Story body text</Label>
        <Textarea
          value={value.body ?? ""}
          onChange={(e) =>
            setValue((v) => ({ ...v, body: e.target.value }))
          }
          placeholder="A detailed description of the story…"
          rows={3}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Farmers reached</Label>
        <Input
          value={value.reach ?? ""}
          onChange={(e) =>
            setValue((v) => ({ ...v, reach: e.target.value }))
          }
          placeholder="e.g. 4,200+"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Actions completed</Label>
        <Input
          value={value.outcome ?? ""}
          onChange={(e) =>
            setValue((v) => ({ ...v, outcome: e.target.value }))
          }
          placeholder="e.g. 1,150"
        />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[90vw] sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden="true" />
            Edit Public Dashboard
          </DialogTitle>
          <DialogDescription>
            Update the statistics, outreach stories, and Farmers' Friday media shown on the public dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Homepage Statistics */}
          <div className="space-y-2">
            <Label className="font-semibold text-sm">Homepage Statistics</Label>
            <p className="text-xs text-muted-foreground">
              The headline numbers shown in the hero section of the public dashboard.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {HOMEPAGE_STATS.map((stat) => (
                <div key={stat.name} className="space-y-1">
                  <Label htmlFor={`stat-${stat.name}`} className="text-xs">
                    {stat.label}
                  </Label>
                  <Input
                    id={`stat-${stat.name}`}
                    value={statValues[stat.name] ?? ""}
                    onChange={(e) =>
                      setStatValues((s) => ({ ...s, [stat.name]: e.target.value }))
                    }
                    placeholder={isLoading ? "Loading..." : stat.defaultValue}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveStats();
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-1">
              <Button
                onClick={handleSaveStats}
                disabled={updating || adding || isLoading}
              >
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Save Statistics
              </Button>
            </div>
          </div>

          {/* Crop Saturation Limit */}
          <div className="space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="saturation-limit" className="font-semibold text-sm">
              Crop Saturation Limit
            </Label>
            <p className="text-xs text-muted-foreground">
              Threshold count of questions to consider a crop "saturated".
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
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="font-semibold text-sm">Outreach Videos</Label>
            <p className="text-xs text-muted-foreground">
              Add YouTube video URLs with dynamic story text to feature on the Outreach & Engagement section.
            </p>

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
                <input
                  ref={outreachVideoFileRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadFile(e.target.files?.[0], "video", OUTREACH_VIDEO_NAME);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => outreachVideoFileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  Upload
                </Button>
              </div>

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

              {newVideoExpanded && renderTextContentFields(newVideo, setNewVideo)}
            </div>

            {/* Existing videos list */}
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading videos...</p>
              ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach videos yet.</p>
              ) : (
                videos.map((video) => {
                  const parsed = parseMediaValue(video.value);
                  const isEditing = editingId === video.id;

                  return (
                    <div key={video.id} className="rounded-md border border-border p-3 space-y-2">
                      {isEditing ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingValue.url}
                              onChange={(e) =>
                                setEditingValue((v) => ({ ...v, url: e.target.value }))
                              }
                              placeholder="URL"
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

                          {editExpanded && renderTextContentFields(editingValue, setEditingValue)}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <a
                              href={parsed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-sm text-primary hover:underline font-medium"
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
                                !!(parsed.place || parsed.title || parsed.body || parsed.reach || parsed.outcome)
                              );
                            }}
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteItem(video.id)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Outreach Images */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="font-semibold text-sm">Outreach Images</Label>
            <p className="text-xs text-muted-foreground">
              Add outreach image URLs or upload image files with dynamic story text to feature on the Outreach & Engagement section.
            </p>

            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  value={newImage.url}
                  onChange={(e) => setNewImage((v) => ({ ...v, url: e.target.value }))}
                  placeholder="https://... (Image URL)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddImage();
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleAddImage}
                  disabled={adding || !newImage.url.trim()}
                >
                  <ImagePlus className="mr-1 h-4 w-4" /> Add
                </Button>
                <input
                  ref={outreachImageFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadFile(e.target.files?.[0], "image", OUTREACH_IMAGE_NAME);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => outreachImageFileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  Upload
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setNewImageExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {newImageExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Text content (optional — shown beside the image)
              </button>

              {newImageExpanded && renderTextContentFields(newImage, setNewImage)}
            </div>

            {/* Existing images list */}
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading outreach images...</p>
              ) : images.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach images yet.</p>
              ) : (
                images.map((image) => {
                  const parsed = parseMediaValue(image.value);
                  const isEditing = editingId === image.id;

                  return (
                    <div key={image.id} className="rounded-md border border-border p-3 space-y-2">
                      {isEditing ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingValue.url}
                              onChange={(e) =>
                                setEditingValue((v) => ({ ...v, url: e.target.value }))
                              }
                              placeholder="Image URL"
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

                          {editExpanded && renderTextContentFields(editingValue, setEditingValue)}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <img
                            src={parsed.url}
                            alt=""
                            className="h-10 w-10 flex-shrink-0 rounded object-cover border border-border"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.visibility =
                                "hidden";
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <a
                              href={parsed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-sm text-primary hover:underline font-medium"
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
                              setEditingId(image.id);
                              setEditingValue(parsed);
                              setEditExpanded(
                                !!(parsed.place || parsed.title || parsed.body || parsed.reach || parsed.outcome)
                              );
                            }}
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteItem(image.id)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Farmers' Friday Media */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <Label className="font-semibold text-sm">Farmers' Friday Media</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Add images or videos to feature in the Farmers' Friday section carousel on the public dashboard.
            </p>

            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={newFarmersKind}
                  onChange={(e) => setNewFarmersKind(e.target.value as "image" | "video")}
                  className="h-9 px-3 py-1 text-xs border border-input rounded-md bg-background"
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
                <Input
                  value={newFarmersMedia.url}
                  onChange={(e) =>
                    setNewFarmersMedia((v) => ({ ...v, url: e.target.value }))
                  }
                  placeholder="https://... (Image or Video URL)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddFarmersMedia();
                  }}
                  className="flex-1 min-w-[200px]"
                />
                <Button
                  variant="outline"
                  onClick={handleAddFarmersMedia}
                  disabled={adding || !newFarmersMedia.url.trim()}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
                <input
                  ref={farmersMediaFileRef}
                  type="file"
                  accept={newFarmersKind === "video" ? "video/*" : "image/*"}
                  className="hidden"
                  onChange={(e) => {
                    const itemName =
                      newFarmersKind === "video"
                        ? FARMERS_FRIDAY_VIDEO_NAME
                        : FARMERS_FRIDAY_IMAGE_NAME;
                    handleUploadFile(e.target.files?.[0], newFarmersKind, itemName);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => farmersMediaFileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  Upload {newFarmersKind}
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setNewFarmersExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {newFarmersExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Text content (optional)
              </button>

              {newFarmersExpanded &&
                renderTextContentFields(newFarmersMedia, setNewFarmersMedia)}
            </div>

            {/* List Farmers' Friday media */}
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading Farmers' Friday media...
                </p>
              ) : farmersFridayMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Farmers' Friday media added yet.
                </p>
              ) : (
                farmersFridayMedia.map((item) => {
                  const parsed = parseMediaValue(item.value);
                  const isEditing = editingId === item.id;
                  const isVideo = item.name === FARMERS_FRIDAY_VIDEO_NAME;

                  return (
                    <div key={item.id} className="rounded-md border border-border p-3 space-y-2">
                      {isEditing ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingValue.url}
                              onChange={(e) =>
                                setEditingValue((v) => ({ ...v, url: e.target.value }))
                              }
                              placeholder="Media URL"
                              className="flex-1"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleSaveEdit(item.id)}
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

                          {editExpanded &&
                            renderTextContentFields(editingValue, setEditingValue)}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {isVideo ? "Video" : "Image"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <a
                              href={parsed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-sm text-primary hover:underline font-medium"
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
                              setEditingId(item.id);
                              setEditingValue(parsed);
                              setEditExpanded(
                                !!(
                                  parsed.place ||
                                  parsed.title ||
                                  parsed.body ||
                                  parsed.reach ||
                                  parsed.outcome
                                )
                              );
                            }}
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteItem(item.id)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
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
