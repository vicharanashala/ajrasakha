import type { IFilterField, IFilterOptionDetail, ITypeTreeOptions } from "./FilterBar";
import type { IDbFilterOptions } from "../services/testersDashboardSummaryService";
import { TYPE_OF_QUESTION_OPTIONS } from "../testerLog/types";
import { channelDisplayLabel } from "../utils";

// Database Logs Analytics filter fields. Options and counts come from the
// backend's dbFilterOptions (Tester UI options + counts from stored
// entries), so - unlike Google Sheet Analytics' FILTER_FIELDS - these carry
// no Sheet column or normalizer.
export const DB_FILTER_FIELDS: IFilterField[] = [
  { key: "category", label: "Question Domain" },
  { key: "build", label: "Build / Version" },
  {
    key: "channel",
    label: "Channel Tested",
    // The form stores "WebApp"; shown as "Web App" / "Cross-Platform" like
    // the rest of the dashboard.
    formatOption: (value) => (value === "WebApp" ? "Web App" : channelDisplayLabel(value)),
  },
  { key: "language", label: "Language Tested" },
  { key: "tester", label: "Tester Name" },
  { key: "status", label: "Overall Test Status" },
  { key: "severity", label: "Defect Severity" },
];

// The Tester UI's Type of Question options, split into the Dynamic/Static
// tree. "Static Dynamic" sits under Dynamic, matching the backend
// (dbFilterOptions.ts) and the Tester UI's isDynamicQuestionType().
const isDynamicType = (type: string) => type.toLowerCase().includes("dynamic");

export const DB_TYPE_TREE: ITypeTreeOptions = {
  dynamic: TYPE_OF_QUESTION_OPTIONS.filter(isDynamicType).map((t) => ({ value: t, label: t })),
  static: TYPE_OF_QUESTION_OPTIONS.filter((t) => !isDynamicType(t)).map((t) => ({ value: t, label: t })),
};

// Adds the backend's counts to DB_TYPE_TREE (counts absent until loaded).
export function dbTypeTreeWithCounts(options?: IDbFilterOptions): ITypeTreeOptions {
  if (!options) return DB_TYPE_TREE;
  const countOf = (list: IFilterOptionDetail[], value: string) => list.find((o) => o.value === value)?.count ?? 0;
  return {
    dynamic: DB_TYPE_TREE.dynamic.map((o) => ({ ...o, count: countOf(options.typeTree.dynamic, o.value) })),
    static: DB_TYPE_TREE.static.map((o) => ({ ...o, count: countOf(options.typeTree.static, o.value) })),
    dynamicCount: options.typeTree.dynamicTotal,
    staticCount: options.typeTree.staticTotal,
  };
}
