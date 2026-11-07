"use client";

import React, { useEffect } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { DIWALI_THEME } from "@/config/festive-season";
import { useFestiveSeason } from "@/hooks/ui/useFestiveSeason";
import { useDiwaliTheme } from "@/hooks/ui/useDiwaliTheme";
import { DiyaIcon } from "@/components/festive/DiyaIcon";

const toggleButtonClassName = "h-10 w-10 px-0 me-3 hover:bg-gray-200 ml-1";

// One-click light and dark switch, used outside the festive season.
const LightDarkToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={toggleButtonClassName}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
};

// Theme menu shown during the festive season, adding the Diwali theme to light and dark.
const FestiveThemeMenu = () => {
  const { theme, setTheme, isDiwaliTheme, applyDiwaliTheme } = useDiwaliTheme();

  // Diwali goes through applyDiwaliTheme so the previous theme can be restored later.
  const handleThemeChange = (value: string) => {
    if (value === DIWALI_THEME) applyDiwaliTheme();
    else setTheme(value);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={toggleButtonClassName}
          aria-label="Change theme"
        >
          {isDiwaliTheme ? (
            <DiyaIcon className="h-6 w-6" />
          ) : theme === "dark" ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
          <DropdownMenuRadioItem value="light" className="cursor-pointer">
            <Sun aria-hidden="true" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="cursor-pointer">
            <Moon aria-hidden="true" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value={DIWALI_THEME} className="cursor-pointer">
            <DiyaIcon className="size-4" />
            Diwali
            <span className="ml-auto rounded-full bg-diwali-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-diwali-ink">
              Festive
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const ThemeToggleCompact = () => {
  const { season } = useFestiveSeason();
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return season ? <FestiveThemeMenu /> : <LightDarkToggle />;
};
