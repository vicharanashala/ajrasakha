import { useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import {
  CalendarDays,
  Filter,
  FileSearch,
  Flag,
  Globe,
  Hash,
  Layers,
  Link as LinkIcon,
  MapPin,
  RotateCcw,
  Sprout,
  User as UserIcon,
  X,
} from "lucide-react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { MultiSelect } from "@/components/atoms/MultiSelect";
import { StateMultiSelect } from "@/components/atoms/StateMultiSelect";
import { CropMultiSelect } from "@/components/atoms/CropMultiSelect";
import { DomainMultiSelect } from "@/components/atoms/DomainMultiSelect";
import { CROPS } from "@/components/MetaData";
import { useGetStates } from "@/hooks/api/location/useLocations";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { useGetUsersByRole } from "@/hooks/api/user/useGetUsersByRole";
import type { ClosedAnswerFilters, SourceType, UserRole } from "@/types";

export const EMPTY_CLOSED_ANSWER_FILTERS: ClosedAnswerFilters = {
  closedAtStart: undefined,
  closedAtEnd: undefined,
  authorIds: [],
  sourcePresence: undefined,
  sourceTypes: [],
  sourceReferenceStatuses: [],
  minSources: undefined,
  maxSources: undefined,
  states: [],
  crops: [],
  domains: [],
  priorities: [],
};

const SOURCE_TYPE_FILTER_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "hyper_local", label: "Hyper Local" },
  { value: "state", label: "State" },
  { value: "central", label: "Central" },
  { value: "other", label: "Other" },
];

const PRIORITY_OPTIONS = ["low", "medium", "high"];

const REFERENCE_STATUS_OPTIONS: {
  value: ClosedAnswerFilters["sourceReferenceStatuses"][number];
  label: string;
}[] = [
  { value: "notFound", label: "Not found" },
  { value: "topLevelMatch", label: "Top level match" },
  { value: "duplicateMatch", label: "Duplicate match" },
];

const AUTHOR_ROLES: UserRole[] = ["expert", "moderator", "admin"];

// Counts the filter groups in use, so the trigger can show how many are active.
export const countActiveFilters = (filters: ClosedAnswerFilters) =>
  (filters.closedAtStart || filters.closedAtEnd ? 1 : 0) +
  (filters.authorIds.length > 0 ? 1 : 0) +
  (filters.sourcePresence ? 1 : 0) +
  (filters.sourceTypes.length > 0 ? 1 : 0) +
  (filters.sourceReferenceStatuses.length > 0 ? 1 : 0) +
  (filters.minSources !== undefined || filters.maxSources !== undefined ? 1 : 0) +
  (filters.states.length > 0 ? 1 : 0) +
  (filters.crops.length > 0 ? 1 : 0) +
  (filters.domains.length > 0 ? 1 : 0) +
  (filters.priorities.length > 0 ? 1 : 0);

const CountBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
      {count}
    </Badge>
  ) : null;

// One titled group of related filters, revealed with a small staggered entrance.
const FilterSection = ({
  icon: Icon,
  title,
  count,
  index,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  index: number;
  children: React.ReactNode;
}) => (
  <motion.section
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.22, ease: "easeOut", delay: index * 0.05 }}
    className="rounded-xl border border-border/60 bg-muted/20 p-3.5"
  >
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <CountBadge count={count} />
    </div>
    {children}
  </motion.section>
);

const FilterField = ({
  icon: Icon,
  label,
  htmlFor,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) => (
  <div className="grid min-w-0 gap-1.5">
    <Label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
    >
      <Icon className="h-3 w-3" />
      {label}
    </Label>
    {children}
  </div>
);

export const ClosedAnswersFilters = ({
  filters,
  onChange,
  showReferenceStatusFilter = false,
}: {
  filters: ClosedAnswerFilters;
  onChange: (next: ClosedAnswerFilters) => void;
  /** Admin-only: filter by the pop lookup outcome recorded on reviewed sources. */
  showReferenceStatusFilter?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ClosedAnswerFilters>(filters);

  const { data: statesResponse = [] } = useGetStates();
  const { data: cropsData } = useGetAllCrops({ type: "crop", limit: 500 });
  const { data: authorsData } = useGetUsersByRole(AUTHOR_ROLES);

  const stateOptions = statesResponse.map((state) => state.stateNameEnglish);
  const dbCrops = cropsData?.crops || [];
  const authors = authorsData ?? [];

  const activeCount = countActiveFilters(filters);
  const draftCount = countActiveFilters(draft);

  // Edits stay in the draft until Apply, so the list is not refetched on every change.
  const setField = <K extends keyof ClosedAnswerFilters>(
    field: K,
    value: ClosedAnswerFilters[K],
  ) => setDraft((prev) => ({ ...prev, [field]: value }));

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft(filters);
    setOpen(nextOpen);
  };

  const applyFilters = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="cursor-pointer gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filters
            <CountBadge count={activeCount} />
          </Button>
        </DialogTrigger>

        <DialogContent className="flex max-h-[88vh] w-[95vw] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b pb-3">
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Filter className="h-4 w-4" />
              </span>
              Filter closed answers
            </DialogTitle>
            <DialogDescription>
              Narrow the list by close date, who answered, source coverage and
              question details.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
            <MotionConfig reducedMotion="user">
              <div className="grid gap-3 py-1 pr-2">
                <FilterSection
                  icon={CalendarDays}
                  title="Closed between"
                  index={0}
                  count={draft.closedAtStart || draft.closedAtEnd ? 1 : 0}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FilterField
                      icon={CalendarDays}
                      label="From"
                      htmlFor="closed-from"
                    >
                      <Input
                        id="closed-from"
                        type="date"
                        max={draft.closedAtEnd}
                        value={draft.closedAtStart ?? ""}
                        onChange={(e) =>
                          setField("closedAtStart", e.target.value || undefined)
                        }
                      />
                    </FilterField>
                    <FilterField
                      icon={CalendarDays}
                      label="Until"
                      htmlFor="closed-until"
                    >
                      <Input
                        id="closed-until"
                        type="date"
                        min={draft.closedAtStart}
                        value={draft.closedAtEnd ?? ""}
                        onChange={(e) =>
                          setField("closedAtEnd", e.target.value || undefined)
                        }
                      />
                    </FilterField>
                  </div>
                </FilterSection>

                <FilterSection
                  icon={UserIcon}
                  title="Who answered"
                  index={1}
                  count={draft.authorIds.length}
                >
                  <FilterField icon={UserIcon} label="Author">
                    <MultiSelect
                      searchable
                      items={authors.map((author) => ({
                        value: author._id,
                        label: author.name,
                      }))}
                      selected={draft.authorIds}
                      onChange={(next) => setField("authorIds", next)}
                      getDisplayLabel={(selected) =>
                        selected.length === 0
                          ? "All authors"
                          : selected.length === 1
                            ? authors.find((a) => a._id === selected[0])?.name ??
                              "1 author selected"
                            : `${selected.length} authors selected`
                      }
                    />
                  </FilterField>
                </FilterSection>

                <FilterSection
                  icon={LinkIcon}
                  title="Sources"
                  index={2}
                  count={
                    (draft.sourcePresence ? 1 : 0) +
                    (draft.sourceTypes.length > 0 ? 1 : 0) +
                    (draft.sourceReferenceStatuses.length > 0 ? 1 : 0) +
                    (draft.minSources !== undefined || draft.maxSources !== undefined
                      ? 1
                      : 0)
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FilterField
                      icon={LinkIcon}
                      label="Coverage"
                      htmlFor="source-presence"
                    >
                      <Select
                        value={draft.sourcePresence ?? "all"}
                        onValueChange={(value) =>
                          setField(
                            "sourcePresence",
                            value === "all"
                              ? undefined
                              : (value as "with" | "without"),
                          )
                        }
                      >
                        <SelectTrigger id="source-presence" className="w-full">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Any</SelectItem>
                          <SelectItem value="with">Has sources</SelectItem>
                          <SelectItem value="without">Missing sources</SelectItem>
                        </SelectContent>
                      </Select>
                    </FilterField>

                    <FilterField
                      icon={Hash}
                      label="Source count"
                      htmlFor="min-sources"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          id="min-sources"
                          type="number"
                          min={0}
                          placeholder="Min"
                          value={draft.minSources ?? ""}
                          onChange={(e) =>
                            setField(
                              "minSources",
                              e.target.value === ""
                                ? undefined
                                : Math.max(0, Number(e.target.value)),
                            )
                          }
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">to</span>
                        <Input
                          type="number"
                          min={0}
                          aria-label="Maximum sources"
                          placeholder="Max"
                          value={draft.maxSources ?? ""}
                          onChange={(e) =>
                            setField(
                              "maxSources",
                              e.target.value === ""
                                ? undefined
                                : Math.max(0, Number(e.target.value)),
                            )
                          }
                        />
                      </div>
                    </FilterField>

                    {showReferenceStatusFilter && (
                      <FilterField icon={FileSearch} label="Reference lookup">
                        <MultiSelect
                          items={REFERENCE_STATUS_OPTIONS.map((opt) => ({
                            value: opt.value,
                            label: opt.label,
                          }))}
                          selected={draft.sourceReferenceStatuses}
                          onChange={(next) =>
                            setField(
                              "sourceReferenceStatuses",
                              next as ClosedAnswerFilters["sourceReferenceStatuses"],
                            )
                          }
                          getDisplayLabel={(selected) =>
                            selected.length === 0
                              ? "Any outcome"
                              : selected.length === 1
                                ? REFERENCE_STATUS_OPTIONS.find(
                                    (opt) => opt.value === selected[0],
                                  )?.label ?? "1 selected"
                                : `${selected.length} selected`
                          }
                        />
                      </FilterField>
                    )}

                    <FilterField icon={Layers} label="Source type">
                      <MultiSelect
                        items={SOURCE_TYPE_FILTER_OPTIONS.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                        selected={draft.sourceTypes}
                        onChange={(next) =>
                          setField("sourceTypes", next as SourceType[])
                        }
                        getDisplayLabel={(selected) =>
                          selected.length === 0
                            ? "All source types"
                            : `${selected.length} selected`
                        }
                      />
                    </FilterField>
                  </div>
                </FilterSection>

                <FilterSection
                  icon={Sprout}
                  title="Question details"
                  index={3}
                  count={
                    (draft.states.length > 0 ? 1 : 0) +
                    (draft.crops.length > 0 ? 1 : 0) +
                    (draft.domains.length > 0 ? 1 : 0) +
                    (draft.priorities.length > 0 ? 1 : 0)
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FilterField icon={MapPin} label="State">
                      <StateMultiSelect
                        searchable
                        states={stateOptions}
                        selected={draft.states}
                        onChange={(next) => setField("states", next)}
                      />
                    </FilterField>

                    <FilterField icon={Sprout} label="Crop">
                      <CropMultiSelect
                        searchable
                        dbCrops={dbCrops}
                        crops={CROPS}
                        selected={draft.crops}
                        onChange={(next) => setField("crops", next)}
                      />
                    </FilterField>

                    <FilterField icon={Globe} label="Domain">
                      <DomainMultiSelect
                        searchable
                        selected={draft.domains}
                        onChange={(next) => setField("domains", next)}
                      />
                    </FilterField>

                    <FilterField icon={Flag} label="Priority">
                      <MultiSelect
                        items={PRIORITY_OPTIONS.map((priority) => ({
                          value: priority,
                          label: <span className="capitalize">{priority}</span>,
                        }))}
                        selected={draft.priorities}
                        onChange={(next) => setField("priorities", next)}
                        getDisplayLabel={(selected) =>
                          selected.length === 0
                            ? "All priorities"
                            : selected.join(", ")
                        }
                      />
                    </FilterField>
                  </div>
                </FilterSection>
              </div>
            </MotionConfig>
          </div>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer gap-1.5"
              disabled={draftCount === 0}
              onClick={() => setDraft(EMPTY_CLOSED_ANSWER_FILTERS)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" className="cursor-pointer" onClick={applyFilters}>
                Apply{draftCount > 0 ? ` (${draftCount})` : ""}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer gap-1 text-muted-foreground"
          onClick={() => onChange(EMPTY_CLOSED_ANSWER_FILTERS)}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
};
