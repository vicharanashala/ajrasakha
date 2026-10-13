// pending = not checked yet, clean = checked and nothing flagged,
// the other three track the reviewer's work
export type GdbStatus = "pending" | "clean" | "todo" | "fixed" | "dismissed";

export type GdbCheckResult = "PASS" | "FAIL" | "NOT_EVALUATED" | "NOT_APPLICABLE";

export interface IGdbCheck {
  parameter: string;
  category: string;
  result: GdbCheckResult;
  reason: string;
  // exact words in the answer to highlight, for a check that found something
  highlight?: string[];
}

export interface IGdbSource {
  sourceName: string;
  source: string;
  page: string;
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
  // suggested correction, null when none was written
  correctedAnswer: string | null;
  comment: string | null;
  checkedAt: string | null;
  reviewedAt: string | null;
}
