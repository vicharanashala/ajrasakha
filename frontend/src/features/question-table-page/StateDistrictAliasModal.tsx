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
import { toast } from "@/shared/components/toast";
import {
  Loader2,
  MapPin,
  Plus,
  Save,
  Search,
  X,
  ChevronRight,
  Trash2,
  History,
  PlusCircle,
  Download,
} from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/atoms/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LocationService,
  type ILocationState,
} from "@/hooks/services/locationService";
import { DistrictAliasModal } from "./DistrictAliasModal";
import { AllDistrictsPanel } from "./AllDistrictsPanel";
import { LocationReasonDialog } from "./LocationReasonDialog";
import { LocationAuditModal } from "./LocationAuditModal";

const locationService = new LocationService();
const STATES_KEY = ["states"];

/**
 * Admin/moderator tool to manage alternate names (aliases) for each state. Aliases let the
 * geo-normalisation flows map variant spellings back to the canonical state.
 */
export const StateDistrictAliasModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: STATES_KEY,
    queryFn: () => locationService.getStates(),
    staleTime: 5 * 60 * 1000,
  });
  // Stable reference so the seeding effect below doesn't loop while loading.
  const states = useMemo<ILocationState[]>(() => data ?? [], [data]);

  const { mutateAsync: saveAliases, isPending: saving } = useMutation({
    mutationKey: ["update-state-aliases"],
    mutationFn: ({
      stateCode,
      aliases,
      name,
    }: {
      stateCode: number;
      aliases: string[];
      name: string;
    }) => locationService.updateStateAliases(stateCode, aliases, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STATES_KEY }),
  });

  const { mutateAsync: addStateMut, isPending: addingState } = useMutation({
    mutationKey: ["add-state"],
    mutationFn: ({ name, reason }: { name: string; reason: string }) =>
      locationService.addState(name, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATES_KEY });
      queryClient.invalidateQueries({ queryKey: ["location-audits"] });
    },
  });

  const { mutateAsync: deleteStateMut, isPending: deletingState } = useMutation({
    mutationKey: ["delete-state"],
    mutationFn: ({ stateCode, reason }: { stateCode: number; reason: string }) =>
      locationService.deleteState(stateCode, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATES_KEY });
      queryClient.invalidateQueries({ queryKey: ["location-audits"] });
    },
  });

  const [search, setSearch] = useState("");
  // Local editable aliases per stateCode + the "add alias" input per stateCode.
  const [drafts, setDrafts] = useState<Record<number, string[]>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [savingCode, setSavingCode] = useState<number | null>(null);
  // The state whose districts modal is open.
  const [districtState, setDistrictState] = useState<
    { code: number; name: string } | null
  >(null);
  // Add-state form + delete-confirm + audit viewer.
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newReason, setNewReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ILocationState | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"states" | "districts">("states");
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  // Seed drafts from the fetched states whenever the dialog opens / data changes.
  useEffect(() => {
    if (!open) return;
    const seeded: Record<number, string[]> = {};
    const seededNames: Record<number, string> = {};
    for (const s of (states as ILocationState[]) ?? []) {
      seeded[s.stateCode] = Array.isArray(s.aliases) ? [...s.aliases] : [];
      seededNames[s.stateCode] = s.stateNameEnglish;
    }
    setDrafts(seeded);
    setNames(seededNames);
    setInputs({});
  }, [open, states]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (states as ILocationState[]) ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.stateNameEnglish.toLowerCase().includes(q) ||
        (drafts[s.stateCode] ?? []).some((a) => a.toLowerCase().includes(q)),
    );
  }, [states, search, drafts]);

  const addAlias = (stateCode: number) => {
    const value = (inputs[stateCode] ?? "").trim();
    if (!value) return;
    setDrafts((prev) => {
      const current = prev[stateCode] ?? [];
      if (current.some((a) => a.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, [stateCode]: [...current, value] };
    });
    setInputs((prev) => ({ ...prev, [stateCode]: "" }));
  };

  const removeAlias = (stateCode: number, idx: number) => {
    setDrafts((prev) => ({
      ...prev,
      [stateCode]: (prev[stateCode] ?? []).filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async (stateCode: number) => {
    const name = (names[stateCode] ?? "").trim();
    if (!name) {
      toast.error("State name cannot be empty.");
      return;
    }
    try {
      setSavingCode(stateCode);
      await saveAliases({ stateCode, aliases: drafts[stateCode] ?? [], name });
      toast.success("Saved.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save.");
    } finally {
      setSavingCode(null);
    }
  };

  const isDirty = (s: ILocationState) => {
    if ((names[s.stateCode] ?? s.stateNameEnglish) !== s.stateNameEnglish) return true;
    const original = Array.isArray(s.aliases) ? s.aliases : [];
    const draft = drafts[s.stateCode] ?? [];
    if (original.length !== draft.length) return true;
    return original.some((a, i) => a !== draft[i]);
  };

  const handleAddState = async () => {
    const name = newName.trim();
    const reason = newReason.trim();
    if (!name) {
      toast.error("State name is required.");
      return;
    }
    if (!reason) {
      toast.error("A reason is required to add a state.");
      return;
    }
    try {
      await addStateMut({ name, reason });
      toast.success(`State "${name}" added.`);
      setNewName("");
      setNewReason("");
      setShowAddForm(false);
    } catch (error: any) {
      toast.error(error?.message || "Failed to add state.");
    }
  };

  const handleDeleteState = async (reason: string) => {
    if (!deleteTarget) return;
    try {
      await deleteStateMut({ stateCode: deleteTarget.stateCode, reason });
      toast.success(`State "${deleteTarget.stateNameEnglish}" deleted.`);
      setDeleteTarget(null);
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete state.");
    }
  };

  const handleDownloadReport = async () => {
    const type = activeTab === "states" ? "state" : "district";
    let toastId: string | undefined;

    try {
      setIsDownloadingReport(true);
      toastId = toast.loading(`Preparing ${type} report...`);

      const blob = await locationService.downloadStateOrDistrictReport(type);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = type === "state" ? "states_list.xlsx" : "districts_list.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.dismiss(toastId);
      toast.success(
        type === "state"
          ? "State report downloaded successfully!"
          : "District report downloaded successfully!",
      );
    } catch (error) {
      if (toastId) toast.dismiss(toastId);
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to download ${type} report`,
      );
    } finally {
      setIsDownloadingReport(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[720px] max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
            Edit State &amp; District
          </DialogTitle>
          <DialogDescription>
            Add alternate names (aliases) for each state so variant spellings map to the
            canonical state.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "states" | "districts")}
          className="flex-1 min-h-0 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="states">States</TabsTrigger>
              <TabsTrigger value="districts">Districts</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadReport}
                disabled={isDownloadingReport}
              >
                {isDownloadingReport ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1 h-4 w-4" />
                )}
                Report
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAuditOpen(true)}>
                <History className="mr-1 h-4 w-4" />
                Audit trail
              </Button>
            </div>
          </div>

          <TabsContent
            value="states"
            className="flex-1 min-h-0 flex flex-col gap-2 mt-0 data-[state=inactive]:hidden"
          >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search state or alias…"
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
            Add State
          </Button>
        </div>

        {showAddForm && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2 dark:border-emerald-800 dark:bg-emerald-950/20">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New state name"
            />
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
                }}
                disabled={addingState}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddState}
                disabled={addingState || !newName.trim() || !newReason.trim()}
              >
                {addingState ? (
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
            <p className="text-sm text-muted-foreground py-6 text-center">No states found.</p>
          ) : (
            filtered.map((s) => {
              const aliases = drafts[s.stateCode] ?? [];
              return (
                <div
                  key={s.stateCode}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      value={names[s.stateCode] ?? s.stateNameEnglish}
                      onChange={(e) =>
                        setNames((prev) => ({ ...prev, [s.stateCode]: e.target.value }))
                      }
                      className="text-sm font-semibold flex-1 h-8"
                      aria-label={`State name for ${s.stateNameEnglish}`}
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      {isDirty(s) && (
                        <Button
                          size="sm"
                          onClick={() => handleSave(s.stateCode)}
                          disabled={saving && savingCode === s.stateCode}
                        >
                          {saving && savingCode === s.stateCode ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="mr-1 h-3.5 w-3.5" />
                          )}
                          Save
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDistrictState({ code: s.stateCode, name: s.stateNameEnglish })
                        }
                      >
                        Districts
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(s)}
                        aria-label={`Delete ${s.stateNameEnglish}`}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Add alias */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={inputs[s.stateCode] ?? ""}
                      onChange={(e) =>
                        setInputs((prev) => ({ ...prev, [s.stateCode]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAlias(s.stateCode);
                        }
                      }}
                      placeholder="Add an alias (e.g. Orissa)"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={!(inputs[s.stateCode] ?? "").trim()}
                      onClick={() => addAlias(s.stateCode)}
                      aria-label={`Add alias for ${s.stateNameEnglish}`}
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
                            onClick={() => removeAlias(s.stateCode, idx)}
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
          </TabsContent>

          <TabsContent
            value="districts"
            className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden"
          >
            <AllDistrictsPanel enabled={activeTab === "districts"} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>

      <DistrictAliasModal
        open={!!districtState}
        onOpenChange={(o) => !o && setDistrictState(null)}
        stateCode={districtState?.code ?? null}
        stateName={districtState?.name ?? ""}
      />

      <LocationReasonDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete state "${deleteTarget?.stateNameEnglish ?? ""}"?`}
        description="This removes the state. Its districts are left intact. This action is recorded in the audit trail."
        confirmLabel="Delete state"
        destructive
        loading={deletingState}
        onConfirm={handleDeleteState}
      />

      <LocationAuditModal open={auditOpen} onOpenChange={setAuditOpen} />
    </>
  );
};

export default StateDistrictAliasModal;
