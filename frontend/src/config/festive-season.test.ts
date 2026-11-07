import { describe, expect, it } from "vitest";
import {
  DIWALI_SEASONS,
  getActiveFestiveSeason,
  parseFestiveThemeMode,
  toLocalDateKey,
} from "./festive-season";

// Builds a local midday date from a YYYY-MM-DD key, shifted by a number of days.
const fromKey = (key: string, offsetDays = 0) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day + offsetDays, 12);
};

describe("DIWALI_SEASONS", () => {
  it("has unique ids, valid windows and is in date order", () => {
    const ids = new Set(DIWALI_SEASONS.map((season) => season.id));
    expect(ids.size).toBe(DIWALI_SEASONS.length);

    DIWALI_SEASONS.forEach((season, index) => {
      expect(toLocalDateKey(fromKey(season.startsOn))).toBe(season.startsOn);
      expect(toLocalDateKey(fromKey(season.endsOn))).toBe(season.endsOn);
      expect(season.startsOn <= season.endsOn).toBe(true);
      if (index > 0) expect(DIWALI_SEASONS[index - 1].endsOn < season.startsOn).toBe(true);
    });
  });
});

describe("getActiveFestiveSeason", () => {
  it.each(DIWALI_SEASONS)("is active on the first and last day of $id", (season) => {
    expect(getActiveFestiveSeason(fromKey(season.startsOn), "auto")).toEqual(season);
    expect(getActiveFestiveSeason(fromKey(season.endsOn), "auto")).toEqual(season);
  });

  it.each(DIWALI_SEASONS)("is inactive just outside $id", (season) => {
    expect(getActiveFestiveSeason(fromKey(season.startsOn, -1), "auto")).toBeNull();
    expect(getActiveFestiveSeason(fromKey(season.endsOn, 1), "auto")).toBeNull();
  });

  it("can be switched off even during the season", () => {
    expect(getActiveFestiveSeason(fromKey(DIWALI_SEASONS[0].startsOn), "off")).toBeNull();
  });

  it("can be forced on outside the season for previews", () => {
    expect(getActiveFestiveSeason(new Date(2026, 2, 1, 12), "diwali")).toEqual(
      DIWALI_SEASONS.at(-1),
    );
  });
});

describe("parseFestiveThemeMode", () => {
  it("accepts known modes case-insensitively and defaults to auto", () => {
    expect(parseFestiveThemeMode(" OFF ")).toBe("off");
    expect(parseFestiveThemeMode("diwali")).toBe("diwali");
    expect(parseFestiveThemeMode("christmas")).toBe("auto");
    expect(parseFestiveThemeMode(undefined)).toBe("auto");
  });
});

describe("toLocalDateKey", () => {
  it("zero-pads month and day", () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});
