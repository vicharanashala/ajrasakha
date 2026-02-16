import { create } from "zustand";

export type Mode = "all" | "review";
export type ColumnKey =
  | "sl_No"
  | "question"
  | "priority"
  | "state"
  | "crop"
  | "domain"
  | "source"
  | "status"
  | "answers"
  | "review_level"
  | "created"
  | "closed"
  | "author"
  | "level_1"
  | "level_2"
  | "level_3"
  | "level_4"
  | "level_5"
  | "level_6"
  | "level_7"
  | "level_8"
  | "level_9";

  export const commonColumns: ColumnKey[] = [
  "sl_No",
  "question",
  "status",
];

export const allModeColumns: ColumnKey[] = [
  "priority",
  "state",
  "crop",
  "domain",
  "source",
  "answers",
  "review_level",
  "created",
  "closed",
];


export const reviewModeColumns: ColumnKey[] = [
  "author",
  "level_1",
  "level_2",
  "level_3",
  "level_4",
  "level_5",
  "level_6",
  "level_7",
  "level_8",
  "level_9",
];

type QuestionTableState = {
  visibleColumns: Record<ColumnKey, boolean>;
  toggleColumn: (column: ColumnKey) => void;
  setColumnVisibility: (column: ColumnKey, value: boolean) => void;
};

export const useQuestionTableStore = create<QuestionTableState>((set) => ({
  visibleColumns: {
    sl_No: true,
    question: true,
    priority: true,
    state: true,
    crop: true,
    domain: true,
    source: true,
    status: true,
    answers: true,
    review_level: true,
    created: true,
    closed: true,
    author: true,
    level_1: true,
    level_2: true,
    level_3: true,
    level_4: true,
    level_5: true,
    level_6: true,
    level_7: true,
    level_8: true,
    level_9: true,
  },

  toggleColumn: (column) =>
    set((state) => ({
      visibleColumns: {
        ...state.visibleColumns,
        [column]: !state.visibleColumns[column],
      },
    })),

  setColumnVisibility: (column, value) =>
    set((state) => ({
      visibleColumns: {
        ...state.visibleColumns,
        [column]: value,
      },
    })),
}));
