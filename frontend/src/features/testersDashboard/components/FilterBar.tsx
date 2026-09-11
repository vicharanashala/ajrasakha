import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/atoms/popover";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TreeCheckbox } from "./TreeCheckbox";

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 Days" },
  { value: "30days", label: "Last 30 Days" },
  { value: "custom", label: "Custom Range" },
];

// value must match the backend's dynamicSubBucketFor output exactly
// (diagnostics.ts's DynamicSubBucket). Exported since the parent dashboard
// also needs these lengths/values for its Dynamic/Static tree handlers.
export const DYNAMIC_SUB_TYPE_OPTIONS = [
  { value: "Weather", label: "Weather" },
  { value: "Mandi Prices", label: "Mandi / Market" },
  { value: "Government Schemes", label: "Schemes" },
];

// value must match normalizeTypeOfQuestion's output exactly (backend's
// filters.ts). Exported for the same reason as DYNAMIC_SUB_TYPE_OPTIONS.
export const STATIC_SUB_TYPE_OPTIONS = [
  { value: "GDB", label: "GDB" },
  { value: "Unique", label: "Unique" },
  { value: "Outreach", label: "Outreach" },
];

// "Static Dynamic" is confirmed removed from the Type of Question taxonomy
// (matches the backend). "UX Feedback" is deliberately left out of the
// Dynamic/Static tree below - TODO: where it belongs is still unresolved.

export interface IFilterBarFiltersState {
  dateRange: string;
  category: string;
  build: string;
  channel: string;
  language: string;
  tester: string;
  status: string;
  severity: string;
}

export interface IFilterField {
  key: keyof IFilterBarFiltersState;
  csvKey: string;
  label: string;
  normalize?: (value?: string) => string;
  // Most fields treat NA/NIL as missing data, excluded from the dropdown.
  // Overall Test Status is the exception - NA is a real, selectable status
  // there, not missing data.
  keepNA?: boolean;
  // Display-only relabeling of a normalized option value (e.g. Channel
  // Tested's "Both" -> "Cross-Platform"). The underlying value passed to
  // onValueChange/matched against filterOptions is unaffected.
  formatOption?: (value: string) => string;
}

// Bundled since the Type of Question tree control has a lot of coupled
// state/handlers - passing them as one object keeps FilterBarProps readable
// instead of 12 separate flat props.
export interface ITypeBranchState {
  typeBranch: "all" | "Dynamic" | "Static";
  dynamicSubTypes: string[];
  staticSubTypes: string[];
  dynamicExpanded: boolean;
  setDynamicExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
  staticExpanded: boolean;
  setStaticExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
  selectTypeBranch: (branch: "Dynamic" | "Static") => void;
  selectAllTypes: () => void;
  toggleDynamicSubType: (value: string) => void;
  toggleDynamicSelectAll: () => void;
  toggleStaticSubType: (value: string) => void;
  toggleStaticSelectAll: () => void;
  typeSummaryLabel: () => string;
}

export interface FilterBarProps {
  filters: IFilterBarFiltersState;
  setFilters: (value: IFilterBarFiltersState | ((prev: IFilterBarFiltersState) => IFilterBarFiltersState)) => void;
  filterOptions: Record<string, string[]>;
  filterFields: IFilterField[];
  customStart: string;
  setCustomStart: (value: string) => void;
  customEnd: string;
  setCustomEnd: (value: string) => void;
  typeBranchState: ITypeBranchState;
}

// flex-wrap (not grid-cols-N) so the layout self-corrects as filter cells
// are added/removed, instead of needing a hand-kept column count.
// min-w-[150px] keeps a cell from being squeezed unreadable before
// wrapping. Custom Range Start/End get their own basis-full row below
// rather than sharing the Date Range cell, which used to crush them into an
// unusably narrow shared column.
export function FilterBar({
  filters,
  setFilters,
  filterOptions,
  filterFields,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  typeBranchState,
}: FilterBarProps) {
  const {
    typeBranch,
    dynamicSubTypes,
    staticSubTypes,
    dynamicExpanded,
    setDynamicExpanded,
    staticExpanded,
    setStaticExpanded,
    selectTypeBranch,
    selectAllTypes,
    toggleDynamicSubType,
    toggleDynamicSelectAll,
    toggleStaticSubType,
    toggleStaticSelectAll,
    typeSummaryLabel,
  } = typeBranchState;

  return (
    <div className="flex flex-wrap gap-3 border rounded-lg p-4 w-full">
      <div className="flex-1 min-w-[150px] space-y-1">
        <label className="text-xs font-medium text-muted-foreground uppercase">
          Date Range
        </label>
        <Select
          value={filters.dateRange}
          onValueChange={(value) =>
            setFilters((prev) => ({ ...prev, dateRange: value }))
          }
        >
          <SelectTrigger className="h-8 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rendered as a Popover, not a plain inline div: an inline tree
          grows this cell's height and collides with neighboring filter
          cells when a branch expands. The trigger button has a fixed
          footprint regardless of open/closed state; the tree itself lives
          in PopoverContent, which portals outside the flex row instead of
          pushing sibling cells. */}
      <div className="flex-1 min-w-[150px] space-y-1">
        <label className="text-xs font-medium text-muted-foreground uppercase">
          Type of Question
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              // Classes copied from atoms/select.tsx's SelectTrigger so
              // this plain <button> matches its sibling filters visually
              // (border, shadow, dark mode, focus ring).
              className="h-8 w-full text-sm border border-input rounded-md px-3 flex items-center justify-between gap-2 bg-transparent shadow-xs dark:bg-input/30 dark:hover:bg-input/50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              {/* text-foreground pinned explicitly since SelectTrigger/
                  SelectValue don't set it themselves, leaving color to
                  ancestor inheritance. */}
              <span className="truncate text-foreground">{typeSummaryLabel()}</span>
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-2 text-sm">
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={selectAllTypes}
                aria-pressed={typeBranch === "all"}
                className={`w-full text-left px-1.5 py-1 rounded truncate ${
                  typeBranch === "all" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                }`}
              >
                All
              </button>

              <div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => selectTypeBranch("Dynamic")}
                    aria-pressed={typeBranch === "Dynamic"}
                    className={`flex-1 text-left px-1.5 py-1 rounded truncate ${
                      typeBranch === "Dynamic" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                    }`}
                  >
                    Dynamic
                  </button>
                  <button
                    type="button"
                    onClick={() => setDynamicExpanded((v) => !v)}
                    className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={dynamicExpanded ? "Collapse Dynamic" : "Expand Dynamic"}
                    aria-expanded={dynamicExpanded}
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform ${dynamicExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                </div>
                {dynamicExpanded && (
                  <div className="pl-3 pb-1 space-y-0.5">
                    <TreeCheckbox
                      label="Select All"
                      checked={dynamicSubTypes.length === DYNAMIC_SUB_TYPE_OPTIONS.length}
                      indeterminate={dynamicSubTypes.length > 0 && dynamicSubTypes.length < DYNAMIC_SUB_TYPE_OPTIONS.length}
                      onChange={toggleDynamicSelectAll}
                    />
                    {DYNAMIC_SUB_TYPE_OPTIONS.map((opt) => (
                      <TreeCheckbox
                        key={opt.value}
                        label={opt.label}
                        checked={dynamicSubTypes.includes(opt.value)}
                        onChange={() => toggleDynamicSubType(opt.value)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => selectTypeBranch("Static")}
                    aria-pressed={typeBranch === "Static"}
                    className={`flex-1 text-left px-1.5 py-1 rounded truncate ${
                      typeBranch === "Static" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                    }`}
                  >
                    Static
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaticExpanded((v) => !v)}
                    className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={staticExpanded ? "Collapse Static" : "Expand Static"}
                    aria-expanded={staticExpanded}
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform ${staticExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                </div>
                {staticExpanded && (
                  <div className="pl-3 pb-1 space-y-0.5">
                    <TreeCheckbox
                      label="Select All"
                      checked={staticSubTypes.length === STATIC_SUB_TYPE_OPTIONS.length}
                      indeterminate={staticSubTypes.length > 0 && staticSubTypes.length < STATIC_SUB_TYPE_OPTIONS.length}
                      onChange={toggleStaticSelectAll}
                    />
                    {STATIC_SUB_TYPE_OPTIONS.map((opt) => (
                      <TreeCheckbox
                        key={opt.value}
                        label={opt.label}
                        checked={staticSubTypes.includes(opt.value)}
                        onChange={() => toggleStaticSubType(opt.value)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {filterFields.map((field) => (
        <div key={field.key} className="flex-1 min-w-[150px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">
            {field.label}
          </label>
          <Select
            value={filters[field.key]}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, [field.key]: value }))
            }
          >
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {filterOptions[field.key]?.map((option) => (
                <SelectItem key={option} value={option}>
                  {field.formatOption ? field.formatOption(option) : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}

      {filters.dateRange === "custom" && (
        <div className="basis-full flex gap-3">
          <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
            <label className="text-xs font-medium text-muted-foreground uppercase">Start</label>
            <input
              type="date"
              className="h-8 w-full text-sm border rounded-md px-2"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
            <label className="text-xs font-medium text-muted-foreground uppercase">End</label>
            <input
              type="date"
              className="h-8 w-full text-sm border rounded-md px-2"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
