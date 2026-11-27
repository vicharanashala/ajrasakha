export interface FestiveSeason {
  id: string;
  name: string;
  /** First day of the season, inclusive, as a local YYYY-MM-DD date. */
  startsOn: string;
  /** Last day of the season, inclusive, as a local YYYY-MM-DD date. */
  endsOn: string;
}

/** next-themes value for the festive theme. It builds on the light palette. */
export const DIWALI_THEME = "diwali";

/** "auto" follows the calendar, "off" disables the theme, "diwali" forces it on for previews. */
export type FestiveThemeMode = "auto" | "off" | "diwali";

// Diwali follows the lunar calendar, so each year is listed explicitly, in date order.
// Each window starts on Dhanteras (two days before Lakshmi Puja) and ends four days
// after Lakshmi Puja, covering Bhai Dooj. Lakshmi Puja dates were checked against
// Drik Panchang, Dekho Panchang and AstroSage. Add the next year before this list runs out.
export const DIWALI_SEASONS: readonly FestiveSeason[] = [
  { id: "diwali-2026", name: "Diwali", startsOn: "2026-11-06", endsOn: "2026-11-12" }, // Lakshmi Puja 8 Nov
  { id: "diwali-2027", name: "Diwali", startsOn: "2027-10-27", endsOn: "2027-11-02" }, // Lakshmi Puja 29 Oct
  { id: "diwali-2028", name: "Diwali", startsOn: "2028-10-15", endsOn: "2028-10-21" }, // Lakshmi Puja 17 Oct
  { id: "diwali-2029", name: "Diwali", startsOn: "2029-11-03", endsOn: "2029-11-09" }, // Lakshmi Puja 5 Nov
  { id: "diwali-2030", name: "Diwali", startsOn: "2030-10-24", endsOn: "2030-10-30" }, // Lakshmi Puja 26 Oct
  { id: "diwali-2031", name: "Diwali", startsOn: "2031-11-12", endsOn: "2031-11-18" }, // Lakshmi Puja 14 Nov
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
