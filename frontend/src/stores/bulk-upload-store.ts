import { create } from "zustand";

export interface BulkUploadState {
  jobId: string | null;
  total: number;
  processed: number;
  created: number;
  duplicates: number;
  failed: number;
  status: "idle" | "running" | "completed" | "failed";
  latestLog: string;
  isMinimized: boolean;
  autoDismissCountdown: number | null; // in seconds

  startJob: (payload: { jobId: string; total: number }) => void;
  updateProgress: (payload: {
    processed?: number;
    created?: number;
    duplicates?: number;
    failed?: number;
    latestLog?: string;
  }) => void;
  finishJob: (payload: {
    created?: number;
    duplicates?: number;
    failed?: number;
    status: "completed" | "failed";
  }) => void;
  toggleMinimize: () => void;
  clearJob: () => void;
  setAutoDismissCountdown: (countdown: number | null) => void;
}

export const useBulkUploadStore = create<BulkUploadState>((set) => ({
  jobId: null,
  total: 0,
  processed: 0,
  created: 0,
  duplicates: 0,
  failed: 0,
  status: "idle",
  latestLog: "",
  isMinimized: false,
  autoDismissCountdown: null,

  startJob: ({ jobId, total }) =>
    set({
      jobId,
      total,
      processed: 0,
      created: 0,
      duplicates: 0,
      failed: 0,
      status: "running",
      latestLog: "Initializing background worker...",
      isMinimized: false,
      autoDismissCountdown: null,
    }),

  updateProgress: (payload) =>
    set((state) => ({
      ...state,
      processed: payload.processed ?? state.processed,
      created: payload.created ?? state.created,
      duplicates: payload.duplicates ?? state.duplicates,
      failed: payload.failed ?? state.failed,
      latestLog: payload.latestLog ?? state.latestLog,
    })),

  finishJob: ({ created, duplicates, failed, status }) =>
    set((state) => ({
      ...state,
      created: created ?? state.created,
      duplicates: duplicates ?? state.duplicates,
      failed: failed ?? state.failed,
      processed: state.total,
      status,
      latestLog:
        status === "completed"
          ? "All questions processed successfully!"
          : "Processing finished with some issues.",
    })),

  toggleMinimize: () =>
    set((state) => ({ isMinimized: !state.isMinimized })),

  clearJob: () =>
    set({
      jobId: null,
      total: 0,
      processed: 0,
      created: 0,
      duplicates: 0,
      failed: 0,
      status: "idle",
      latestLog: "",
      isMinimized: false,
      autoDismissCountdown: null,
    }),

  setAutoDismissCountdown: (autoDismissCountdown) =>
    set({ autoDismissCountdown }),
}));
