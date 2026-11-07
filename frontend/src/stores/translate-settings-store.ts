import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TranslateMode, TranslateModel } from "@/features/faq-pop/api";

// Global translation settings for whoever is signed in on this browser — one mode and one
// pipeline for every translation they start (Main Table, document detail, "Translate again").
// pipeline 1 = OCR then Gemini Flash, 0 = single Gemini Pro call per page. PoP only accepts
// pipeline 1 with mode "normal" (flex/batch → 400), so picking either of those forces 0.
interface TranslateSettingsStore {
  mode: TranslateMode;
  pipeline: 0 | 1;
  model: TranslateModel;
  setMode: (mode: TranslateMode) => void;
  setPipeline: (pipeline: 0 | 1) => void;
  setModel: (model: TranslateModel) => void;
}

export const useTranslateSettings = create<TranslateSettingsStore>()(
  persist(
    (set) => ({
      mode: "normal",
      pipeline: 1,
      model: "gemini-3.8-flash",
      setMode: (mode) => set(mode === "normal" ? { mode } : { mode, pipeline: 0 }),
      setPipeline: (pipeline) => set({ pipeline }),
      setModel: (model) => set({ model }),
    }),
    {
      name: "translate-settings",
      // v1 stored model: null (or a model the toggle no longer offers) — reset to the default tier.
      version: 2,
      migrate: (state: any) => ({ ...state, model: "gemini-3.8-flash" }),
    },
  ),
);
