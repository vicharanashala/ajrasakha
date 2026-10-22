import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { toast } from "sonner";
import { Loader2, Plus, PlusCircle, Save, Search, Trash2, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LocationService,
  type ILocationDistrict,
  type ILocationState,
} from "@/hooks/services/locationService";
import { LocationReasonDialog } from "./LocationReasonDialog";

const locationService = new LocationService();
const ALL_DISTRICTS_KEY = ["all-districts"];

/**
 * The "Districts" tab: every district across every state, searchable, with the same
 * rename / alias / delete functionality plus an "Add District" form (state + name +
 * aliases + reason). Shows the common "All" district once it has been added.
 */
export const AllDistrictsPanel = ({ enabled }: { enabled: boolean }) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ALL_DISTRICTS_KEY,
    queryFn: () => locationService.getAllDistricts(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  const districts = useMemo<ILocationDistrict[]>(() => data ?? [], [data]);

  const { data: statesData } = useQuery({
    queryKey: ["states"],
    queryFn: () => locationService.getStates(),
    staleTime: 5 * 60 * 1000,
  });
  const states = useMemo<ILocationState[]>(() => statesData ?? [], [statesData]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ALL_DISTRICTS_KEY });
    queryClient.invalidateQueries({ queryKey: ["districts"] });
    queryClient.invalidateQueries({ queryKey: ["location-audits"] });
  };

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
    onSuccess: invalidate,
  });

  const { mutateAsync: addDistrictMut, isPending: addingDistrict } = useMutation({
    mutationKey: ["add-district"],
    mutationFn: ({
      stateCode,
      name,
      reason,
      aliases,
    }: {
      stateCode: number;
      name: string;
      reason: string;
      aliases: string[];
    }) => locationService.addDistrict(stateCode, name, reason, aliases),
    onSuccess: invalidate,
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
      onSuccess: invalidate,
    });

  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string[]>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [savingCode, setSavingCode] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ILocationDistrict | null>(null);

  // Add-district form.
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStateCode, setAddStateCode] = useState<string>("");
  const [addName, setAddName] = useState("");
  const [addReason, setAddReason] = useState("");
  const [addAliases, setAddAliases] = useState<string[]>([]);
  const [addAliasInput, setAddAliasInput] = useState("");

  useEffect(() => {
    const seeded: Record<number, string[]> = {};
    const seededNames: Record<number, string> = {};
    for (const d of districts) {
      seeded[d.districtCode] = Array.isArray(d.aliases) ? [...d.aliases] : [];
      seededNames[d.districtCode] = d.districtNameEnglish;
    }
    setDrafts(seeded);
    setNames(seededNames);
    setInputs({});
  }, [districts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return districts;
    return districts.filter(
      (d) =>
        d.districtNameEnglish.toLowerCase().includes(q) ||
        (d.stateName ?? "").toLowerCase().includes(q) ||
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
    const value = addAliasInput.trim();
    if (!value) return;
    setAddAliases((prev) =>
      prev.some((a) => a.toLowerCase() === value.toLowerCase())
        ? prev
        : [...prev, value],
    );
    setAddAliasInput("");
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setAddStateCode("");
    setAddName("");
    setAddReason("");
    setAddAliases([]);
    setAddAliasInput("");
  };

  const handleAddDistrict = async () => {
    if (!addStateCode) {
      toast.error("Please select a state.");
      return;
    }
    if (!addName.trim()) {
      toast.error("District name is required.");
      return;
    }
    if (!addReason.trim()) {
      toast.error("A reason is required to add a district.");
      return;
    }
    try {
      await addDistrictMut({
        stateCode: Number(addStateCode),
        name: addName.trim(),
        reason: addReason.trim(),
        aliases: addAliases,
      });
      toast.success(`District "${addName.trim()}" added.`);
      resetAddForm();
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

  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search district, state or alias…"
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
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
          <Select value={addStateCode} onValueChange={setAddStateCode}>
            <SelectTrigger>
              <SelectValue placeholder="Select a state" />
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s.stateCode} value={String(s.stateCode)}>
                  {s.stateNameEnglish}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="New district name"
          />

          {/* Optional aliases for the new district */}
          <div className="flex items-center gap-2">
            <Input
              value={addAliasInput}
              onChange={(e) => setAddAliasInput(e.target.value)}
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
              disabled={!addAliasInput.trim()}
              onClick={addNewAlias}
              aria-label="Add alias to new district"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {addAliases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {addAliases.map((a, idx) => (
                <span
                  key={`${a}-${idx}`}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() =>
                      setAddAliases((prev) => prev.filter((_, i) => i !== idx))
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
            value={addReason}
            onChange={(e) => setAddReason(e.target.value)}
            placeholder="Reason for adding (required)"
          />

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={resetAddForm}
              disabled={addingDistrict}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddDistrict}
              disabled={
                addingDistrict ||
                !addStateCode ||
                !addName.trim() ||
                !addReason.trim()
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
          <p className="text-sm text-muted-foreground py-6 text-center">
            No districts found.
          </p>
        ) : (
          filtered.map((d) => {
            const aliases = drafts[d.districtCode] ?? [];
            return (
              <div
                key={d.districtCode}
                className="rounded-lg border border-border p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {d.stateName || "—"}
                    </span>
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
                  </div>
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
                      setInputs((prev) => ({
                        ...prev,
                        [d.districtCode]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addAlias(d.districtCode);
                      }
                    }}
                    placeholder="Add an alias"
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

      <LocationReasonDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete district "${deleteTarget?.districtNameEnglish ?? ""}"?`}
        description="This removes the district. This action is recorded in the audit trail."
        confirmLabel="Delete district"
        destructive
        loading={deletingDistrict}
        onConfirm={handleDeleteDistrict}
      />
    </div>
  );
};

export default AllDistrictsPanel;
