import { create } from "zustand";

export type BulkOperationType = "upload" | "delete" | "rdqa_check";

export interface BulkUploadState {
  jobId: string | null;
  operationType: BulkOperationType;
  total: number;
  processed: number;
  created: number;
  deleted: number;
  duplicates: number;
  failed: number;
  passed: number;
  flagged: number;
  status: "idle" | "running" | "completed" | "failed";
  latestLog: string;
  isMinimized: boolean;
  autoDismissCountdown: number | null; // in seconds

  startJob: (payload: {
    jobId: string;
    total: number;
    operationType?: BulkOperationType;
  }) => void;
  updateProgress: (payload: {
    processed?: number;
    created?: number;
    deleted?: number;
    duplicates?: number;
    failed?: number;
    passed?: number;
    flagged?: number;
    latestLog?: string;
  }) => void;
  finishJob: (payload: {
    created?: number;
    deleted?: number;
    duplicates?: number;
    failed?: number;
    passed?: number;
    flagged?: number;
    status: "completed" | "failed";
  }) => void;
  toggleMinimize: () => void;
  clearJob: () => void;
  setAutoDismissCountdown: (countdown: number | null) => void;
}

export const useBulkUploadStore = create<BulkUploadState>((set) => ({
  jobId: null,
  operationType: "upload",
  total: 0,
  processed: 0,
  created: 0,
  deleted: 0,
  duplicates: 0,
  failed: 0,
  passed: 0,
  flagged: 0,
  status: "idle",
  latestLog: "",
  isMinimized: false,
  autoDismissCountdown: null,

  startJob: ({ jobId, total, operationType = "upload" }) =>
    set({
      jobId,
      operationType,
      total,
      processed: 0,
      created: 0,
      deleted: 0,
      duplicates: 0,
      failed: 0,
      passed: 0,
      flagged: 0,
      status: "running",
      latestLog:
        operationType === "delete"
          ? "Initializing bulk delete worker..."
          : operationType === "rdqa_check"
          ? "Initializing RDQA quality checks..."
          : "Initializing background worker...",
      isMinimized: false,
      autoDismissCountdown: null,
    }),

  updateProgress: (payload) =>
    set((state) => ({
      ...state,
      processed: payload.processed ?? state.processed,
      created: payload.created ?? state.created,
      deleted: payload.deleted ?? state.deleted,
      duplicates: payload.duplicates ?? state.duplicates,
      failed: payload.failed ?? state.failed,
      passed: payload.passed ?? state.passed,
      flagged: payload.flagged ?? state.flagged,
      latestLog: payload.latestLog ?? state.latestLog,
    })),

  finishJob: ({ created, deleted, duplicates, failed, passed, flagged, status }) =>
    set((state) => ({
      ...state,
      created: created ?? state.created,
      deleted: deleted ?? state.deleted,
      duplicates: duplicates ?? state.duplicates,
      failed: failed ?? state.failed,
      passed: passed ?? state.passed,
      flagged: flagged ?? state.flagged,
      processed: state.total,
      status,
      latestLog:
        status === "completed"
          ? state.operationType === "delete"
            ? "All selected questions deleted successfully!"
            : state.operationType === "rdqa_check"
            ? "RDQA quality checks completed!"
            : "All questions processed successfully!"
          : "Processing finished with some issues.",
    })),

  toggleMinimize: () =>
    set((state) => ({ isMinimized: !state.isMinimized })),

  clearJob: () =>
    set({
      jobId: null,
      operationType: "upload",
      total: 0,
      processed: 0,
      created: 0,
      deleted: 0,
      duplicates: 0,
      failed: 0,
      passed: 0,
      flagged: 0,
      status: "idle",
      latestLog: "",
      isMinimized: false,
      autoDismissCountdown: null,
    }),

  setAutoDismissCountdown: (autoDismissCountdown) =>
    set({ autoDismissCountdown }),
}));
