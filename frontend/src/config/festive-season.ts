export interface FestiveSeason {
  id: string;
  name: string;
  /** First day of the season, inclusive, as a local YYYY-MM-DD date. */
  startsOn: string;
  /** Last day of the season, inclusive, as a local YYYY-MM-DD date. */
  endsOn: string;
}

/** "auto" follows the calendar, "off" disables the theme, "diwali" forces it on for previews. */
export type FestiveThemeMode = "auto" | "off" | "diwali";

// Diwali follows the lunar calendar, so each year is listed explicitly.
// The window opens shortly before Dhanteras and closes after Bhai Dooj.
export const DIWALI_SEASONS: readonly FestiveSeason[] = [
  { id: "diwali-2026", name: "Diwali", startsOn: "2026-11-04", endsOn: "2026-11-12" },
];

// Formats a date as YYYY-MM-DD in the user's local time zone.
export function toLocalDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Normalises the raw env value, treating anything unknown as "auto".
export function parseFestiveThemeMode(value: string | undefined): FestiveThemeMode {
  const normalised = value?.trim().toLowerCase();
  return normalised === "off" || normalised === "diwali" ? normalised : "auto";
}

// Returns the Diwali season active on the given date, honouring the env override.
export function getActiveFestiveSeason(
  now: Date,
  mode: FestiveThemeMode,
): FestiveSeason | null {
  if (mode === "off") return null;

  const today = toLocalDateKey(now);
  const current = DIWALI_SEASONS.find(
    (season) => today >= season.startsOn && today <= season.endsOn,
  );
  if (current) return current;

  return mode === "diwali" ? (DIWALI_SEASONS.at(-1) ?? null) : null;
}
