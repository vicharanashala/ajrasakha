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
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  Plus,
  Save,
  Search,
  X,
  Trash2,
  PlusCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LocationService,
  type ILocationDistrict,
} from "@/hooks/services/locationService";
import { LocationReasonDialog } from "./LocationReasonDialog";

const locationService = new LocationService();

/**
 * Admin/moderator tool to manage alternate names (aliases) for the districts of a state.
 * Opened from the state-alias modal when the user clicks "Districts" beside a state.
 */
export const DistrictAliasModal = ({
  open,
  onOpenChange,
  stateCode,
  stateName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stateCode: number | null;
  stateName: string;
}) => {
  const queryClient = useQueryClient();
  const districtsKey = ["districts", stateCode];

  const { data, isLoading } = useQuery({
    queryKey: districtsKey,
    queryFn: () => locationService.getDistricts(stateCode as number),
    enabled: open && stateCode != null,
    staleTime: 5 * 60 * 1000,
  });
  // Stable reference so the seeding effect below doesn't loop while loading.
  const districts = useMemo<ILocationDistrict[]>(() => data ?? [], [data]);

  const { mutateAsync: saveAliases, isPending: saving } = useMutation({
    mutationKey: ["update-district-aliases"],
    mutationFn: ({
      districtCode,
      aliases,
      name,
    }: {
      districtCode: number;
      aliases: string[];
      name: string;
    }) => locationService.updateDistrictAliases(districtCode, aliases, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: districtsKey }),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: districtsKey });
    queryClient.invalidateQueries({ queryKey: ["all-districts"] });
    queryClient.invalidateQueries({ queryKey: ["location-audits"] });
  };

  const { mutateAsync: addDistrictMut, isPending: addingDistrict } = useMutation({
    mutationKey: ["add-district"],
    mutationFn: ({
      name,
      reason,
      aliases,
    }: {
      name: string;
      reason: string;
      aliases: string[];
    }) => locationService.addDistrict(stateCode as number, name, reason, aliases),
    onSuccess: invalidateAll,
  });

  const { mutateAsync: deleteDistrictMut, isPending: deletingDistrict } =
    useMutation({
      mutationKey: ["delete-district"],
      mutationFn: ({
        districtCode,
        reason,
      }: {
        districtCode: number;
        reason: string;
      }) => locationService.deleteDistrict(districtCode, reason),
      onSuccess: invalidateAll,
    });

  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string[]>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [savingCode, setSavingCode] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newAliases, setNewAliases] = useState<string[]>([]);
  const [newAliasInput, setNewAliasInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ILocationDistrict | null>(null);

  useEffect(() => {
    if (!open) return;
    const seeded: Record<number, string[]> = {};
    const seededNames: Record<number, string> = {};
    for (const d of (districts as ILocationDistrict[]) ?? []) {
      seeded[d.districtCode] = Array.isArray(d.aliases) ? [...d.aliases] : [];
      seededNames[d.districtCode] = d.districtNameEnglish;
    }
    setDrafts(seeded);
    setNames(seededNames);
    setInputs({});
    setSearch("");
  }, [open, districts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (districts as ILocationDistrict[]) ?? [];
    if (!q) return list;
    return list.filter(
      (d) =>
        d.districtNameEnglish.toLowerCase().includes(q) ||
        (drafts[d.districtCode] ?? []).some((a) => a.toLowerCase().includes(q)),
    );
  }, [districts, search, drafts]);

  const addAlias = (districtCode: number) => {
    const value = (inputs[districtCode] ?? "").trim();
    if (!value) return;
    setDrafts((prev) => {
      const current = prev[districtCode] ?? [];
      if (current.some((a) => a.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, [districtCode]: [...current, value] };
    });
    setInputs((prev) => ({ ...prev, [districtCode]: "" }));
  };

  const removeAlias = (districtCode: number, idx: number) => {
    setDrafts((prev) => ({
      ...prev,
      [districtCode]: (prev[districtCode] ?? []).filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async (districtCode: number) => {
    const name = (names[districtCode] ?? "").trim();
    if (!name) {
      toast.error("District name cannot be empty.");
      return;
    }
    try {
      setSavingCode(districtCode);
      await saveAliases({ districtCode, aliases: drafts[districtCode] ?? [], name });
      toast.success("Saved.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save.");
    } finally {
      setSavingCode(null);
    }
  };

  const isDirty = (d: ILocationDistrict) => {
    if ((names[d.districtCode] ?? d.districtNameEnglish) !== d.districtNameEnglish)
      return true;
    const original = Array.isArray(d.aliases) ? d.aliases : [];
    const draft = drafts[d.districtCode] ?? [];
    if (original.length !== draft.length) return true;
    return original.some((a, i) => a !== draft[i]);
  };

  const addNewAlias = () => {
    const value = newAliasInput.trim();
    if (!value) return;
    setNewAliases((prev) =>
      prev.some((a) => a.toLowerCase() === value.toLowerCase())
        ? prev
        : [...prev, value],
    );
    setNewAliasInput("");
  };

  const handleAddDistrict = async () => {
    const name = newName.trim();
    const reason = newReason.trim();
    if (stateCode == null) return;
    if (!name) {
      toast.error("District name is required.");
      return;
    }
    if (!reason) {
      toast.error("A reason is required to add a district.");
      return;
    }
    try {
      await addDistrictMut({ name, reason, aliases: newAliases });
      toast.success(`District "${name}" added.`);
      setNewName("");
      setNewReason("");
      setNewAliases([]);
      setNewAliasInput("");
      setShowAddForm(false);
    } catch (error: any) {
      toast.error(error?.message || "Failed to add district.");
    }
  };

  const handleDeleteDistrict = async (reason: string) => {
    if (!deleteTarget) return;
    try {
      await deleteDistrictMut({ districtCode: deleteTarget.districtCode, reason });
      toast.success(`District "${deleteTarget.districtNameEnglish}" deleted.`);
      setDeleteTarget(null);
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete district.");
    }
  };

  const handleDownloadStateReport = async () => {
    setIsDownloadingCrops(true);
    try {
      const blob = await cropService.downloadList('crop');
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "crops_list.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download crops list.");
    } finally {
      setIsDownloadingCrops(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[680px] max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
            Districts — {stateName}
          </DialogTitle>
          <DialogDescription>
            Add alternate names (aliases) for each district in {stateName || "this state"}.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search district or alias…"
            className="pl-9"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant={showAddForm ? "secondary" : "default"}
            onClick={() => setShowAddForm((v) => !v)}
          >
            <PlusCircle className="mr-1 h-4 w-4" />
            Add District
          </Button>
        </div>

        {showAddForm && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2 dark:border-emerald-800 dark:bg-emerald-950/20">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`New district name in ${stateName || "this state"}`}
            />

            {/* Optional aliases for the new district */}
            <div className="flex items-center gap-2">
              <Input
                value={newAliasInput}
                onChange={(e) => setNewAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNewAlias();
                  }
                }}
                placeholder="Add an alias (optional)"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!newAliasInput.trim()}
                onClick={addNewAlias}
                aria-label="Add alias to new district"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {newAliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {newAliases.map((a, idx) => (
                  <span
                    key={`${a}-${idx}`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                  >
                    {a}
                    <button
                      type="button"
                      onClick={() =>
                        setNewAliases((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label={`Remove ${a}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <Input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Reason for adding (required)"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setNewName("");
                  setNewReason("");
                  setNewAliases([]);
                  setNewAliasInput("");
                }}
                disabled={addingDistrict}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddDistrict}
                disabled={
                  addingDistrict || !newName.trim() || !newReason.trim()
                }
              >
                {addingDistrict ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No districts found.</p>
          ) : (
            filtered.map((d) => {
              const aliases = drafts[d.districtCode] ?? [];
              return (
                <div
                  key={d.districtCode}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      value={names[d.districtCode] ?? d.districtNameEnglish}
                      onChange={(e) =>
                        setNames((prev) => ({
                          ...prev,
                          [d.districtCode]: e.target.value,
                        }))
                      }
                      className="text-sm font-semibold flex-1 h-8"
                      aria-label={`District name for ${d.districtNameEnglish}`}
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      {isDirty(d) && (
                        <Button
                          size="sm"
                          onClick={() => handleSave(d.districtCode)}
                          disabled={saving && savingCode === d.districtCode}
                        >
                          {saving && savingCode === d.districtCode ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="mr-1 h-3.5 w-3.5" />
                          )}
                          Save
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(d)}
                        aria-label={`Delete ${d.districtNameEnglish}`}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={inputs[d.districtCode] ?? ""}
                      onChange={(e) =>
                        setInputs((prev) => ({ ...prev, [d.districtCode]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAlias(d.districtCode);
                        }
                      }}
                      placeholder="Add an alias (e.g. Chittor)"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={!(inputs[d.districtCode] ?? "").trim()}
                      onClick={() => addAlias(d.districtCode)}
                      aria-label={`Add alias for ${d.districtNameEnglish}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {aliases.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {aliases.map((a, idx) => (
                        <span
                          key={`${a}-${idx}`}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                        >
                          {a}
                          <button
                            type="button"
                            onClick={() => removeAlias(d.districtCode, idx)}
                            className="hover:text-emerald-900 dark:hover:text-emerald-100"
                            aria-label={`Remove ${a}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>

      <LocationReasonDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete district "${deleteTarget?.districtNameEnglish ?? ""}"?`}
        description="This removes the district from this state. This action is recorded in the audit trail."
        confirmLabel="Delete district"
        destructive
        loading={deletingDistrict}
        onConfirm={handleDeleteDistrict}
      />
    </>
  );
};

export default DistrictAliasModal;
