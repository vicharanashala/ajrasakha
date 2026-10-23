import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import type { AgriTechListFilters, AgriTechSort } from "@/hooks/services/cropService";

type Presence = "all" | "with" | "without";

/** Filter values as edited in the drawer; "all" and empty strings mean no filter. */
export interface AgriTechFilterState {
  sort: AgriTechSort;
  aliases: Presence;
  image: Presence;
  status: string;
  language: string;
  region: string;
  /** yyyy-mm-dd values from the date inputs. */
  updatedFrom: string;
  updatedTo: string;
}

export const DEFAULT_AGRITECH_FILTERS: AgriTechFilterState = {
  sort: "name_asc",
  aliases: "all",
  image: "all",
  status: "all",
  language: "all",
  region: "all",
  updatedFrom: "",
  updatedTo: "",
};

const SORT_OPTIONS: { value: AgriTechSort; label: string }[] = [
  { value: "name_asc", label: "Name (A to Z)" },
  { value: "name_desc", label: "Name (Z to A)" },
  { value: "updated_desc", label: "Recently updated" },
  { value: "updated_asc", label: "Least recently updated" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const CHEMICAL_STATUSES = ["Banned", "Restricted"];

/** Turns a yyyy-mm-dd value into the start or end of that local day, as ISO. */
const toDayBoundary = (date: string, edge: "start" | "end") =>
  date ? new Date(`${date}T${edge === "start" ? "00:00:00" : "23:59:59.999"}`).toISOString() : undefined;

/** Converts the drawer state into the query filters, dropping anything left at "all". */
export const toListFilters = (
  state: AgriTechFilterState,
  scope: { showImage: boolean; showStatus: boolean },
): AgriTechListFilters => ({
  aliases: state.aliases === "all" ? undefined : state.aliases,
  image: scope.showImage && state.image !== "all" ? state.image : undefined,
  status: scope.showStatus && state.status !== "all" ? state.status : undefined,
  language: state.language === "all" ? undefined : state.language,
  region: state.region === "all" ? undefined : state.region,
  updatedFrom: toDayBoundary(state.updatedFrom, "start"),
  updatedTo: toDayBoundary(state.updatedTo, "end"),
});

/** How many filters differ from their defaults, for the badge on the filter button. */
export const countActiveFilters = (
  state: AgriTechFilterState,
  scope: { showImage: boolean; showStatus: boolean },
) =>
  Object.values(toListFilters(state, scope)).filter(Boolean).length +
  (state.sort !== DEFAULT_AGRITECH_FILTERS.sort ? 1 : 0);

/** A labelled block in the drawer. */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
    {children}
  </div>
);

/** Three-way segmented control for "with / without" style filters. */
const PresenceToggle = ({
  value,
  onChange,
  labels,
}: {
  value: Presence;
  onChange: (value: Presence) => void;
  labels: [string, string, string];
}) => (
  <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a1a] p-1">
    {(["all", "with", "without"] as Presence[]).map((option, i) => (
      <button
        key={option}
        type="button"
        role="radio"
        aria-checked={value === option}
        onClick={() => onChange(option)}
        className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
          value === option
            ? "bg-white text-gray-900 shadow-sm dark:bg-[#262626] dark:text-white"
            : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
      >
        {labels[i]}
      </button>
    ))}
  </div>
);

export const AgriTechFilterDrawer = ({
  open,
  onClose,
  value,
  onChange,
  languages,
  states,
  showImage,
  showStatus,
  entityLabel,
}: {
  open: boolean;
  onClose: () => void;
  value: AgriTechFilterState;
  onChange: (next: AgriTechFilterState) => void;
  languages: string[];
  states: string[];
  showImage: boolean;
  showStatus: boolean;
  /** Plural noun of the active tab, e.g. "crops". */
  entityLabel: string;
}) => {
  const set = <K extends keyof AgriTechFilterState>(key: K, next: AgriTechFilterState[K]) =>
    onChange({ ...value, [key]: next });
  const isDateRangeInvalid = Boolean(value.updatedFrom && value.updatedTo && value.updatedFrom > value.updatedTo);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="agritech-filter-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            key="agritech-filter-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agritech-filter-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed top-0 right-0 z-[60] flex h-full w-full max-w-[380px] flex-col border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-[#141414] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a1a] p-6">
              <div>
                <h2 id="agritech-filter-title" className="text-lg font-bold text-gray-900 dark:text-white">
                  Filters
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">Narrow down the {entityLabel} list</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close filters"
                className="rounded-full p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <Field label="Sort by">
                <Select value={value.sort} onValueChange={(v: AgriTechSort) => set("sort", v)}>
                  <SelectTrigger className="h-9 w-full text-sm" aria-label="Sort by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Aliases">
                <PresenceToggle
                  value={value.aliases}
                  onChange={(v) => set("aliases", v)}
                  labels={["All", "With aliases", "No aliases"]}
                />
              </Field>

              <Field label="Alias language">
                <Select value={value.language} onValueChange={(v) => set("language", v)}>
                  <SelectTrigger className="h-9 w-full text-sm" aria-label="Alias language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">All languages</SelectItem>
                    {languages.map((language) => (
                      <SelectItem key={language} value={language}>{language}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Alias state / region">
                <Select value={value.region} onValueChange={(v) => set("region", v)}>
                  <SelectTrigger className="h-9 w-full text-sm" aria-label="Alias state or region">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">All states</SelectItem>
                    {states.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {showImage && (
                <Field label="Image">
                  <PresenceToggle
                    value={value.image}
                    onChange={(v) => set("image", v)}
                    labels={["All", "With image", "No image"]}
                  />
                </Field>
              )}

              {showStatus && (
                <Field label="Status">
                  <Select value={value.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger className="h-9 w-full text-sm" aria-label="Status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {CHEMICAL_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <Field label="Last updated">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                    From
                    <Input
                      type="date"
                      value={value.updatedFrom}
                      max={value.updatedTo || undefined}
                      onChange={(e) => set("updatedFrom", e.target.value)}
                      className="h-9 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                    To
                    <Input
                      type="date"
                      value={value.updatedTo}
                      min={value.updatedFrom || undefined}
                      onChange={(e) => set("updatedTo", e.target.value)}
                      className="h-9 text-sm"
                    />
                  </label>
                </div>
                {isDateRangeInvalid && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400">The start date is after the end date.</p>
                )}
              </Field>
            </div>

            <div className="flex items-center gap-2 border-t border-gray-200 dark:border-gray-800 p-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onChange(DEFAULT_AGRITECH_FILTERS)}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
              <Button className="flex-1" onClick={onClose}>
                Done
              </Button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
