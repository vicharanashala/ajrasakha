import { useCallback } from "react";
import { useTheme } from "next-themes";
import { DIWALI_THEME } from "@/config/festive-season";
import { useFestiveThemeStore } from "@/stores/festive-theme-store";
import { useFestiveSeason } from "./useFestiveSeason";

const FALLBACK_THEME = "dark";

// Switches into and out of the Diwali theme with its lights on, returning users
// to the theme they had before when they leave.
export function useDiwaliTheme() {
  const { theme, setTheme } = useTheme();
  const { setDecorationsEnabled } = useFestiveSeason();
  const themeBeforeDiwali = useFestiveThemeStore((state) => state.themeBeforeDiwali);
  const setThemeBeforeDiwali = useFestiveThemeStore((state) => state.setThemeBeforeDiwali);
  const setLastFireworksOn = useFestiveThemeStore((state) => state.setLastFireworksOn);

  const isDiwaliTheme = theme === DIWALI_THEME;

  const applyDiwaliTheme = useCallback(() => {
    if (theme && theme !== DIWALI_THEME) setThemeBeforeDiwali(theme);
    // The theme is meant to be seen with its lights, so switch them back on.
    setDecorationsEnabled(true);
    // Clearing the date lets the fireworks show play for this fresh switch.
    setLastFireworksOn(null);
    setTheme(DIWALI_THEME);
  }, [theme, setTheme, setThemeBeforeDiwali, setLastFireworksOn, setDecorationsEnabled]);

  const leaveDiwaliTheme = useCallback(() => {
    setTheme(themeBeforeDiwali ?? FALLBACK_THEME);
  }, [themeBeforeDiwali, setTheme]);

  return { theme, setTheme, isDiwaliTheme, applyDiwaliTheme, leaveDiwaliTheme };
}
