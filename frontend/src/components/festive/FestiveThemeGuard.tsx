import { useEffect } from "react";
import { useDiwaliTheme } from "@/hooks/ui/useDiwaliTheme";
import { useFestiveSeason } from "@/hooks/ui/useFestiveSeason";
import { useFestiveThemeStore } from "@/stores/festive-theme-store";

// Keeps the theme in step with the festive season: the Diwali theme is switched on
// by default once per season, any theme the user picks afterwards is respected, and
// everyone returns to their previous theme once the season is over.
export function FestiveThemeGuard() {
  const { season } = useFestiveSeason();
  const { isDiwaliTheme, applyDiwaliTheme, leaveDiwaliTheme } = useDiwaliTheme();

  useEffect(() => {
    if (!season) return;
    // Read the store directly so marking the season does not re-run this effect.
    const { defaultAppliedSeasonId, markDefaultApplied } = useFestiveThemeStore.getState();
    if (defaultAppliedSeasonId === season.id) return;

    markDefaultApplied(season.id);
    if (!isDiwaliTheme) applyDiwaliTheme();
  }, [season, isDiwaliTheme, applyDiwaliTheme]);

  useEffect(() => {
    if (isDiwaliTheme && !season) leaveDiwaliTheme();
  }, [isDiwaliTheme, season, leaveDiwaliTheme]);

  return null;
}
