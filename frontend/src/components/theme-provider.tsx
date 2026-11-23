import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { DIWALI_THEME } from "@/config/festive-season";
import { FestiveThemeGuard } from "@/components/festive/FestiveThemeGuard";

interface ThemeProviderProps {
  children: ReactNode;
}

const APP_THEMES = ["light", "dark", DIWALI_THEME];

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"        
      defaultTheme="dark"     
      themes={APP_THEMES}
      // enableSystem={true}      
    >
      <FestiveThemeGuard />
      {children}
    </NextThemesProvider>
  );
}
