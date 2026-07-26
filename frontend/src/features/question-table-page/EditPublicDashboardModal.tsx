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
import { toast } from "sonner";
import { Check, LayoutDashboard, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import {
  useAddPublicDashboardItem,
  useDeletePublicDashboardItem,
  usePublicDashboardItems,
  useUpdatePublicDashboardItem,
} from "@/hooks/api/public-dashboard/usePublicDashboardConfig";
import {
  OUTREACH_VIDEO_NAME,
  SATURATION_LIMIT_NAME,
} from "@/hooks/services/publicDashboardService";

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

  const [saturationLimit, setSaturationLimit] = useState<string>("");
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState("");

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
    const url = newVideoUrl.trim();
    if (!url) {
      toast.error("Enter a video URL.");
      return;
    }
    try {
      await addItem({ name: OUTREACH_VIDEO_NAME, value: url });
      setNewVideoUrl("");
      toast.success("Outreach video added.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add video.");
    }
  };

  const handleSaveEdit = async (id: string) => {
    const url = editingUrl.trim();
    if (!url) {
      toast.error("URL cannot be empty.");
      return;
    }
    try {
      await updateItem({ id, patch: { value: url } });
      setEditingId(null);
      setEditingUrl("");
      toast.success("Outreach video updated.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update video.");
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
              Add video URLs to feature on the public dashboard. You can edit or
              delete them anytime.
            </p>

            {/* Add new */}
            <div className="flex items-center gap-2">
              <Input
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddVideo();
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleAddVideo}
                disabled={adding || !newVideoUrl.trim()}
              >
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>

            {/* List */}
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading videos...</p>
              ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No outreach videos yet.
                </p>
              ) : (
                videos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center gap-2 rounded-md border border-border p-2"
                  >
                    {editingId === video.id ? (
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
                            setEditingUrl("");
                          }}
                          aria-label="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <a
                          href={String(video.value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 truncate text-sm text-primary hover:underline"
                          title={String(video.value)}
                        >
                          {String(video.value)}
                        </a>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(video.id);
                            setEditingUrl(String(video.value));
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
