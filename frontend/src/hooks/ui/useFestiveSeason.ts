import { useCallback, useMemo } from "react";
import { env } from "@/config/env";
import {
  getActiveFestiveSeason,
  parseFestiveThemeMode,
} from "@/config/festive-season";
import { useFestiveThemeStore } from "@/stores/festive-theme-store";

// Resolves the active festive season and whether this user wants its decorations shown.
export function useFestiveSeason() {
  const season = useMemo(
    () => getActiveFestiveSeason(new Date(), parseFestiveThemeMode(env.festiveTheme())),
    [],
  );
  const hiddenSeasonId = useFestiveThemeStore((state) => state.hiddenSeasonId);
  const setDecorationsHidden = useFestiveThemeStore((state) => state.setDecorationsHidden);

  const decorationsEnabled = season !== null && hiddenSeasonId !== season.id;

  const setDecorationsEnabled = useCallback(
    (enabled: boolean) => {
      if (season) setDecorationsHidden(season.id, !enabled);
    },
    [season, setDecorationsHidden],
  );

  return { season, decorationsEnabled, setDecorationsEnabled };
}
