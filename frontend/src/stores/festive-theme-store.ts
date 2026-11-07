import { create } from "zustand";
import { persist } from "zustand/middleware";

// Per-browser festive theme preferences. Hiding is remembered per season so
// next year's theme shows again even if this year's was switched off.
interface FestiveThemeStore {
  hiddenSeasonId: string | null;
  lastCelebratedOn: string | null;
  greetingSeenSeasonId: string | null;
  setDecorationsHidden: (seasonId: string, hidden: boolean) => void;
  markCelebrated: (dateKey: string) => void;
  markGreetingSeen: (seasonId: string) => void;
}

export const useFestiveThemeStore = create<FestiveThemeStore>()(
  persist(
    (set) => ({
      hiddenSeasonId: null,
      lastCelebratedOn: null,
      greetingSeenSeasonId: null,
      setDecorationsHidden: (seasonId, hidden) =>
        set({ hiddenSeasonId: hidden ? seasonId : null }),
      markCelebrated: (dateKey) => set({ lastCelebratedOn: dateKey }),
      markGreetingSeen: (seasonId) => set({ greetingSeenSeasonId: seasonId }),
    }),
    { name: "festive-theme" },
  ),
);
