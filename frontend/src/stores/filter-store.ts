import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

// ── Slice types ────────────────────────────────────────────────────────────────

/** QA interface preferences dialog (source, review_level, states, crops). */
export type ExpertViewFilter = {
  source: string;
  review_level: string;
  states: string[];
  crops: string[];
};

/** Download filtered report dialog. */
export type DownloadFilter = {
  state: string;
  normalised_crop: string;
  season: string;
  domain: string;
  status: string;
  hiddenQuestions: boolean;
  duplicateQuestions: boolean;
};

/** Review level chart filter dialog. */
export type ReviewLevelFilter = {
  state: string;
  crop: string;
  normalised_crop: string;
  domain: string;
  status: string;
  userId: string;
  dateRange: { startTime?: Date; endTime?: Date };
};

// ── Defaults ───────────────────────────────────────────────────────────────────

/** Used for reset — source resets to "all". */
export const DEFAULT_QUESTION_TABLE_FILTER: AdvanceFilterValues = {
  status: "all",
  source: "all",
  state: "all",
  states: [],
  crop: "all",
  normalised_crop: "all",
  normalisedCrops: [],
  answersCount: [0, 100],
  dateRange: "all",
  priority: "all",
  domain: "all",
  user: "all",
  review_level: "all",
  startTime: undefined,
  endTime: undefined,
  closedAtStart: undefined,
  closedAtEnd: undefined,
  consecutiveApprovals: "all",
  autoAllocateFilter: "all",
  hiddenQuestions: false,
  duplicateQuestions: false,
  isOnHold: false,
};

/** Initial load — mirrors the legacy default of source: "AJRASAKHA". */
const INITIAL_QUESTION_TABLE_FILTER: AdvanceFilterValues = {
  ...DEFAULT_QUESTION_TABLE_FILTER,
  source: "AJRASAKHA",
};

export const DEFAULT_EXPERT_VIEW_FILTER: ExpertViewFilter = {
  source: "all",
  review_level: "all",
  states: [],
  crops: [],
};

export const DEFAULT_DOWNLOAD_FILTER: DownloadFilter = {
  state: "all",
  normalised_crop: "all",
  season: "all",
  domain: "all",
  status: "all",
  hiddenQuestions: false,
  duplicateQuestions: false,
};

export const DEFAULT_REVIEW_LEVEL_FILTER: ReviewLevelFilter = {
  state: "all",
  crop: "all",
  normalised_crop: "all",
  domain: "all",
  status: "all",
  userId: "all",
  dateRange: {},
};

// ── Store ──────────────────────────────────────────────────────────────────────

interface FilterStore {
  questionTable: AdvanceFilterValues;
  expertView: ExpertViewFilter;
  downloadReport: DownloadFilter;
  reviewLevel: ReviewLevelFilter;

  setQuestionTableFilter: (values: AdvanceFilterValues) => void;
  resetQuestionTableFilter: () => void;
  setExpertViewFilter: (values: ExpertViewFilter) => void;
  resetExpertViewFilter: () => void;
  setDownloadFilter: (values: DownloadFilter) => void;
  resetDownloadFilter: () => void;
  setReviewLevelFilter: (values: ReviewLevelFilter) => void;
  resetReviewLevelFilter: () => void;
}

export const useFilterStore = create<FilterStore>()(
  devtools(
    (set) => ({
      questionTable: INITIAL_QUESTION_TABLE_FILTER,
      expertView: DEFAULT_EXPERT_VIEW_FILTER,
      downloadReport: DEFAULT_DOWNLOAD_FILTER,
      reviewLevel: DEFAULT_REVIEW_LEVEL_FILTER,

      setQuestionTableFilter: (values) => set({ questionTable: values }),
      resetQuestionTableFilter: () =>
        set({ questionTable: DEFAULT_QUESTION_TABLE_FILTER }),
      setExpertViewFilter: (values) => set({ expertView: values }),
      resetExpertViewFilter: () =>
        set({ expertView: DEFAULT_EXPERT_VIEW_FILTER }),
      setDownloadFilter: (values) => set({ downloadReport: values }),
      resetDownloadFilter: () =>
        set({ downloadReport: DEFAULT_DOWNLOAD_FILTER }),
      setReviewLevelFilter: (values) => set({ reviewLevel: values }),
      resetReviewLevelFilter: () =>
        set({ reviewLevel: DEFAULT_REVIEW_LEVEL_FILTER }),
    }),
    { name: "FilterStore" }
  )
);
