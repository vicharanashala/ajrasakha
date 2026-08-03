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
import { Loader2, MapPin, Plus, Save, Search, X, ChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LocationService,
  type ILocationState,
} from "@/hooks/services/locationService";
import { DistrictAliasModal } from "./DistrictAliasModal";

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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search state or alias…"
            className="pl-9"
          />
        </div>

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
    </>
  );
};

export default StateDistrictAliasModal;
