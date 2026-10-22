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
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  useAddPublicDashboardItem,
  useDeletePublicDashboardItem,
  usePublicDashboardItems,
  useReorderPublicDashboardItems,
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
import type { PublicDashboardItem } from "@/hooks/services/publicDashboardService";

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
  const { mutateAsync: reorderItems } = useReorderPublicDashboardItems();
  const { mutateAsync: uploadMedia, isPending: uploading } =
    useUploadPublicDashboardMedia();

  const outreachImageFileRef = useRef<HTMLInputElement>(null);
  const outreachVideoFileRef = useRef<HTMLInputElement>(null);
  const farmersVideoFileRef = useRef<HTMLInputElement>(null);
  const farmersImageFileRef = useRef<HTMLInputElement>(null);

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
  const farmersFridayVideos = useMemo(
    () => items?.filter((i) => i.name === FARMERS_FRIDAY_VIDEO_NAME) ?? [],
    [items]
  );
  const farmersFridayImages = useMemo(
    () => items?.filter((i) => i.name === FARMERS_FRIDAY_IMAGE_NAME) ?? [],
    [items]
  );

  const [saturationLimit, setSaturationLimit] = useState<string>("");
  const [statValues, setStatValues] = useState<Record<string, string>>({});

  // Drag-and-drop state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

  // New outreach video state
  const [newVideo, setNewVideo] = useState<MediaValue>(EMPTY_NEW_MEDIA);
  const [newVideoExpanded, setNewVideoExpanded] = useState(false);

  // New outreach image state
  const [newImage, setNewImage] = useState<MediaValue>(EMPTY_NEW_MEDIA);
  const [newImageExpanded, setNewImageExpanded] = useState(false);

  // New Farmers Friday video state
  const [newFarmersVideo, setNewFarmersVideo] = useState<MediaValue>(EMPTY_NEW_MEDIA);
  const [newFarmersVideoExpanded, setNewFarmersVideoExpanded] = useState(false);

  // New Farmers Friday image state
  const [newFarmersImage, setNewFarmersImage] = useState<MediaValue>(EMPTY_NEW_MEDIA);
  const [newFarmersImageExpanded, setNewFarmersImageExpanded] = useState(false);

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

  const handleAddFarmersVideo = async () => {
    const url = newFarmersVideo.url.trim();
    if (!url) {
      toast.error("Enter a video URL.");
      return;
    }
    try {
      const value = buildMediaValue({ ...newFarmersVideo, url });
      await addItem({ name: FARMERS_FRIDAY_VIDEO_NAME, value });
      setNewFarmersVideo(EMPTY_NEW_MEDIA);
      setNewFarmersVideoExpanded(false);
      toast.success("Farmers' Friday video added.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add Farmers' Friday video.");
    }
  };

  const handleAddFarmersImage = async () => {
    const url = newFarmersImage.url.trim();
    if (!url) {
      toast.error("Enter an image URL.");
      return;
    }
    try {
      const value = buildMediaValue({ ...newFarmersImage, url });
      await addItem({ name: FARMERS_FRIDAY_IMAGE_NAME, value });
      setNewFarmersImage(EMPTY_NEW_MEDIA);
      setNewFarmersImageExpanded(false);
      toast.success("Farmers' Friday image added.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add Farmers' Friday image.");
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

  const handleReorderSectionItems = async (
    sectionItems: PublicDashboardItem[],
    fromIdx: number,
    toIdx: number
  ) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || toIdx >= sectionItems.length) return;

    const reorderedSection = [...sectionItems];
    const [moved] = reorderedSection.splice(fromIdx, 1);
    reorderedSection.splice(toIdx, 0, moved);

    const sectionIds = new Set(sectionItems.map((i) => i.id));
    const fullOrderedIds: string[] = [];
    let secIdx = 0;

    for (const item of items ?? []) {
      if (sectionIds.has(item.id)) {
        if (secIdx < reorderedSection.length) {
          fullOrderedIds.push(reorderedSection[secIdx].id);
          secIdx++;
        }
      } else {
        fullOrderedIds.push(item.id);
      }
    }

    try {
      await reorderItems(fullOrderedIds);
      toast.success("Sequence updated.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update item order.");
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

  const renderReorderableItem = (
    item: PublicDashboardItem,
    idx: number,
    sectionItems: PublicDashboardItem[],
    isVideo: boolean
  ) => {
    const parsed = parseMediaValue(item.value);
    const isEditing = editingId === item.id;
    const isDragging = draggedItemId === item.id;
    const isDragOver = dragOverItemId === item.id;

    return (
      <div
        key={item.id}
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", item.id);
          setDraggedItemId(item.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (draggedItemId && draggedItemId !== item.id) {
            setDragOverItemId(item.id);
          }
        }}
        onDragLeave={() => {
          if (dragOverItemId === item.id) setDragOverItemId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverItemId(null);
          const sourceId = draggedItemId || e.dataTransfer.getData("text/plain");
          if (!sourceId || sourceId === item.id) return;
          const fromIdx = sectionItems.findIndex((i) => i.id === sourceId);
          if (fromIdx !== -1) {
            handleReorderSectionItems(sectionItems, fromIdx, idx);
          }
          setDraggedItemId(null);
        }}
        onDragEnd={() => {
          setDraggedItemId(null);
          setDragOverItemId(null);
        }}
        className={`rounded-md border p-3 space-y-2 transition-all ${
          isDragging ? "opacity-40 border-dashed border-primary" : "border-border"
        } ${isDragOver ? "border-primary bg-primary/10 shadow-sm" : ""}`}
      >
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

            {editExpanded && renderTextContentFields(editingValue, setEditingValue)}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
              title="Drag to reorder sequence"
            >
              <GripVertical className="h-4 w-4" />
            </span>

            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={idx === 0}
                onClick={() => handleReorderSectionItems(sectionItems, idx, idx - 1)}
                title="Move Up"
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={idx === sectionItems.length - 1}
                onClick={() => handleReorderSectionItems(sectionItems, idx, idx + 1)}
                title="Move Down"
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>

            {isVideo ? (
              <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <img
                src={parsed.url}
                alt=""
                className="h-8 w-8 flex-shrink-0 rounded object-cover border border-border"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                }}
              />
            )}

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
            Update statistics, outreach stories, and Farmers' Friday media. Drag items to reorder sequence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Homepage Statistics */}
          <div className="space-y-2">
            <Label className="font-semibold text-sm">Homepage Statistics</Label>
            <p className="text-xs text-muted-foreground">
              Headline numbers shown in the hero section of the public dashboard.
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
              Add YouTube video URLs with dynamic story text to feature on the Outreach & Engagement section. Drag to reorder.
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
                videos.map((video, idx) =>
                  renderReorderableItem(video, idx, videos, true)
                )
              )}
            </div>
          </div>

          {/* Outreach Images */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="font-semibold text-sm">Outreach Images</Label>
            <p className="text-xs text-muted-foreground">
              Add outreach image URLs or upload image files with dynamic story text. Drag to reorder sequence.
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
                images.map((image, idx) =>
                  renderReorderableItem(image, idx, images, false)
                )
              )}
            </div>
          </div>

          {/* Farmers' Friday Videos */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <Label className="font-semibold text-sm">Farmers' Friday Videos</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Add YouTube video URLs or upload video files to feature in the Farmers' Friday section carousel. Drag to reorder.
            </p>

            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  value={newFarmersVideo.url}
                  onChange={(e) =>
                    setNewFarmersVideo((v) => ({ ...v, url: e.target.value }))
                  }
                  placeholder="YouTube URL — https://youtube.com/watch?v=..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddFarmersVideo();
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleAddFarmersVideo}
                  disabled={adding || !newFarmersVideo.url.trim()}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add Video
                </Button>
                <input
                  ref={farmersVideoFileRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadFile(e.target.files?.[0], "video", FARMERS_FRIDAY_VIDEO_NAME);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => farmersVideoFileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  Upload Video
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setNewFarmersVideoExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {newFarmersVideoExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Text content (optional)
              </button>

              {newFarmersVideoExpanded &&
                renderTextContentFields(newFarmersVideo, setNewFarmersVideo)}
            </div>

            {/* Existing Farmers' Friday Videos List */}
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading Farmers' Friday videos...
                </p>
              ) : farmersFridayVideos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Farmers' Friday videos added yet.
                </p>
              ) : (
                farmersFridayVideos.map((item, idx) =>
                  renderReorderableItem(item, idx, farmersFridayVideos, true)
                )
              )}
            </div>
          </div>

          {/* Farmers' Friday Images */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <Label className="font-semibold text-sm">Farmers' Friday Images</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Add image URLs or upload image files to feature in the Farmers' Friday section carousel. Drag to reorder.
            </p>

            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  value={newFarmersImage.url}
                  onChange={(e) =>
                    setNewFarmersImage((v) => ({ ...v, url: e.target.value }))
                  }
                  placeholder="https://... (Image URL)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddFarmersImage();
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleAddFarmersImage}
                  disabled={adding || !newFarmersImage.url.trim()}
                >
                  <ImagePlus className="mr-1 h-4 w-4" /> Add Image
                </Button>
                <input
                  ref={farmersImageFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadFile(e.target.files?.[0], "image", FARMERS_FRIDAY_IMAGE_NAME);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => farmersImageFileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  Upload Image
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setNewFarmersImageExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {newFarmersImageExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Text content (optional)
              </button>

              {newFarmersImageExpanded &&
                renderTextContentFields(newFarmersImage, setNewFarmersImage)}
            </div>

            {/* Existing Farmers' Friday Images List */}
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading Farmers' Friday images...
                </p>
              ) : farmersFridayImages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Farmers' Friday images added yet.
                </p>
              ) : (
                farmersFridayImages.map((item, idx) =>
                  renderReorderableItem(item, idx, farmersFridayImages, false)
                )
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
