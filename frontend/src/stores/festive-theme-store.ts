import { create } from "zustand";
import { persist } from "zustand/middleware";

// Per-browser festive theme preferences. Hiding is remembered per season so
// next year's theme shows again even if this year's was switched off.
interface FestiveThemeStore {
  hiddenSeasonId: string | null;
  lastCelebratedOn: string | null;
  greetingSeenSeasonId: string | null;
  themeBeforeDiwali: string | null;
  lastFireworksOn: string | null;
  /** Season in which the Diwali theme was switched on by default for this browser. */
  defaultAppliedSeasonId: string | null;
  setDecorationsHidden: (seasonId: string, hidden: boolean) => void;
  markCelebrated: (dateKey: string) => void;
  markGreetingSeen: (seasonId: string) => void;
  setThemeBeforeDiwali: (theme: string) => void;
  setLastFireworksOn: (dateKey: string | null) => void;
  markDefaultApplied: (seasonId: string) => void;
}

export const useFestiveThemeStore = create<FestiveThemeStore>()(
  persist(
    (set) => ({
      hiddenSeasonId: null,
      lastCelebratedOn: null,
      greetingSeenSeasonId: null,
      themeBeforeDiwali: null,
      lastFireworksOn: null,
      defaultAppliedSeasonId: null,
      setDecorationsHidden: (seasonId, hidden) =>
        set({ hiddenSeasonId: hidden ? seasonId : null }),
      markCelebrated: (dateKey) => set({ lastCelebratedOn: dateKey }),
      markGreetingSeen: (seasonId) => set({ greetingSeenSeasonId: seasonId }),
      setThemeBeforeDiwali: (theme) => set({ themeBeforeDiwali: theme }),
      setLastFireworksOn: (dateKey) => set({ lastFireworksOn: dateKey }),
      markDefaultApplied: (seasonId) => set({ defaultAppliedSeasonId: seasonId }),
    }),
    { name: "festive-theme" },
  ),
);
