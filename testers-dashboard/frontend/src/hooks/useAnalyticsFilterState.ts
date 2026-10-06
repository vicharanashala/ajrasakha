import { useState } from "react";
import { DYNAMIC_SUB_TYPE_OPTIONS, STATIC_SUB_TYPE_OPTIONS, type ITypeBranchState } from "../components/FilterBar";
import { EMPTY_FILTERS } from "../components/analyticsFilterFields";

// Filter-bar state (single-select filters, custom date range, and the
// Dynamic/Static type tree) shared by SheetAnalyticsSection and
// DbAnalyticsSection. Each section calls this hook itself, so the two
// sources keep fully independent filter selections.
export function useAnalyticsFilterState() {
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [dynamicSubTypes, setDynamicSubTypes] = useState<string[]>([]);
  const [typeBranch, setTypeBranch] = useState<"all" | "Dynamic" | "Static">("all");
  const [staticSubTypes, setStaticSubTypes] = useState<string[]>([]);
  const [dynamicExpanded, setDynamicExpanded] = useState(false);
  const [staticExpanded, setStaticExpanded] = useState(false);

  function selectTypeBranch(branch: "Dynamic" | "Static") {
    setTypeBranch((prev) => (prev === branch ? "all" : branch));
    setDynamicSubTypes([]);
    setStaticSubTypes([]);
  }

  function selectAllTypes() {
    setTypeBranch("all");
    setDynamicSubTypes([]);
    setStaticSubTypes([]);
  }

  function toggleDynamicSubType(value: string) {
    setStaticSubTypes([]);
    // An empty array under an already-selected Dynamic branch displays as
    // "all checked" (see FilterBar's dynamicWholeBranchSelected), so
    // toggling one item off must start from the full list, not the empty
    // array, or it would re-add the unchecked item instead of removing it.
    // Reaching zero items resets the branch to unselected rather than
    // reverting to "everything included" while still showing as selected.
    const effectivePrev =
      dynamicSubTypes.length === 0 && typeBranch === "Dynamic" ? DYNAMIC_SUB_TYPE_OPTIONS.map((o) => o.value) : dynamicSubTypes;
    const next = effectivePrev.includes(value) ? effectivePrev.filter((v) => v !== value) : [...effectivePrev, value];
    setTypeBranch(next.length === 0 ? "all" : "Dynamic");
    setDynamicSubTypes(next);
  }

  // Toggles between all-selected and none. "All-selected" includes the
  // implicit case (branch selected, empty array) - see
  // dynamicWholeBranchSelected in FilterBar. Clicking it while fully
  // checked can't just clear to `[]`, since that's the same wire value as
  // "whole branch, no restriction" and would immediately redisplay as
  // fully checked - so it drops the branch selection entirely instead.
  function toggleDynamicSelectAll() {
    setStaticSubTypes([]);
    const isFullyChecked =
      typeBranch === "Dynamic" && (dynamicSubTypes.length === 0 || dynamicSubTypes.length === DYNAMIC_SUB_TYPE_OPTIONS.length);
    if (isFullyChecked) {
      setTypeBranch("all");
      setDynamicSubTypes([]);
    } else {
      setTypeBranch("Dynamic");
      setDynamicSubTypes(DYNAMIC_SUB_TYPE_OPTIONS.map((o) => o.value));
    }
  }

  function toggleStaticSubType(value: string) {
    setDynamicSubTypes([]);
    // Same reasoning as toggleDynamicSubType above.
    const effectivePrev =
      staticSubTypes.length === 0 && typeBranch === "Static" ? STATIC_SUB_TYPE_OPTIONS.map((o) => o.value) : staticSubTypes;
    const next = effectivePrev.includes(value) ? effectivePrev.filter((v) => v !== value) : [...effectivePrev, value];
    setTypeBranch(next.length === 0 ? "all" : "Static");
    setStaticSubTypes(next);
  }

  // Same reasoning as toggleDynamicSelectAll above.
  function toggleStaticSelectAll() {
    setDynamicSubTypes([]);
    const isFullyChecked =
      typeBranch === "Static" && (staticSubTypes.length === 0 || staticSubTypes.length === STATIC_SUB_TYPE_OPTIONS.length);
    if (isFullyChecked) {
      setTypeBranch("all");
      setStaticSubTypes([]);
    } else {
      setTypeBranch("Static");
      setStaticSubTypes(STATIC_SUB_TYPE_OPTIONS.map((o) => o.value));
    }
  }

  function typeSummaryLabel(): string {
    if (typeBranch === "Dynamic") {
      if (dynamicSubTypes.length === 0 || dynamicSubTypes.length === DYNAMIC_SUB_TYPE_OPTIONS.length) return "Dynamic";
      return `Dynamic (${dynamicSubTypes.length} selected)`;
    }
    if (typeBranch === "Static") {
      if (staticSubTypes.length === 0 || staticSubTypes.length === STATIC_SUB_TYPE_OPTIONS.length) return "Static";
      return `Static (${staticSubTypes.length} selected)`;
    }
    return "All";
  }

  const typeBranchState: ITypeBranchState = {
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
  };

  return {
    filters,
    setFilters,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    dynamicSubTypes,
    typeBranch,
    staticSubTypes,
    typeBranchState,
  };
}

export type IAnalyticsFilterState = ReturnType<typeof useAnalyticsFilterState>;
