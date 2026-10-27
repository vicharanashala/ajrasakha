// pending = not checked yet, clean = checked and nothing flagged,
// the other three track the reviewer's work
export type GdbStatus = "pending" | "clean" | "todo" | "fixed" | "dismissed";

export type GdbCheckResult = "PASS" | "FAIL" | "NOT_EVALUATED" | "NOT_APPLICABLE";

// a reviewer's change to one check: not a problem (PASS) or a problem (FAIL)
export interface IGdbCheckOverride {
  result: "PASS" | "FAIL";
  comment: string;
  by: string;
  at: string;
}

export interface IGdbCheck {
  parameter: string;
  category: string;
  // what the system found; a reviewer's change is in `override`
  result: GdbCheckResult;
  reason: string;
  // exact words in the answer to highlight, for a check that found something
  highlight?: string[];
  override?: IGdbCheckOverride;
}

// what counts after a reviewer's change
export const effectiveResult = (check: IGdbCheck): GdbCheckResult =>
  check.override ? check.override.result : check.result;

export type GdbSourceType = "central" | "state" | "district" | "hyper_local" | "other";

export const SOURCE_TYPE_LABELS: Record<GdbSourceType, string> = {
  central: "Central",
  state: "State",
  district: "District",
  hyper_local: "Hyper-local",
  other: "Other",
};

export interface IGdbSource {
  sourceName: string;
  source: string;
  page: string;
  // the same types the reviewer app uses for a source
  sourceType?: GdbSourceType;
}

export type GdbAction =
  | "accepted"
  | "dismissed"
  | "flag_changed"
  | "sources_edited"
  | "correction_saved"
  | "pushed";

export const ACTION_LABELS: Record<GdbAction, string> = {
  accepted: "Accepted correction",
  dismissed: "Dismissed flags",
  flag_changed: "Changed a flag",
  sources_edited: "Edited sources",
  correction_saved: "Saved correction",
  pushed: "Pushed to GDB",
};

// one thing a reviewer did on an answer
export interface IGdbHistoryEntry {
  answerId: string;
  question: string;
  action: GdbAction;
  at: string;
  userId: string;
  userName: string | null;
  details: Record<string, unknown> | null;
}

// one row of the list
export interface IGdbListItem {
  id: string;
  question: string;
  state: string;
  crop: string;
  domain: string;
  // names of the checks that failed
  flags: string[];
  // names of the checks that could not run
  notEvaluated: string[];
  status: GdbStatus;
}

// one answer with everything the review screen needs
export interface IGdbCleaningItem extends IGdbListItem {
  answer: string;
  sources: IGdbSource[];
  // the 13 checks, in order
  checks: IGdbCheck[];
  // true when a reviewer changed the sources; the pipeline's own are in originalSources
  sourcesEdited: boolean;
  originalSources: IGdbSource[];
  // when the accepted correction was pushed to the golden answer
  pushedAt: string | null;
  // suggested correction, null when none was written
  correctedAnswer: string | null;
  comment: string | null;
  checkedAt: string | null;
  reviewedAt: string | null;
}
