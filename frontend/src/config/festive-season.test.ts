import { describe, expect, it } from "vitest";
import {
  DIWALI_SEASONS,
  getActiveFestiveSeason,
  parseFestiveThemeMode,
  toLocalDateKey,
} from "./festive-season";

const season = DIWALI_SEASONS[0];
const localDate = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12);

describe("getActiveFestiveSeason", () => {
  it("is active on the first and last day of the window", () => {
    expect(getActiveFestiveSeason(localDate(2026, 11, 4), "auto")).toEqual(season);
    expect(getActiveFestiveSeason(localDate(2026, 11, 12), "auto")).toEqual(season);
  });

  it("is inactive just outside the window", () => {
    expect(getActiveFestiveSeason(localDate(2026, 11, 3), "auto")).toBeNull();
    expect(getActiveFestiveSeason(localDate(2026, 11, 13), "auto")).toBeNull();
  });

  it("can be switched off even during the season", () => {
    expect(getActiveFestiveSeason(localDate(2026, 11, 8), "off")).toBeNull();
  });

  it("can be forced on outside the season for previews", () => {
    expect(getActiveFestiveSeason(localDate(2026, 3, 1), "diwali")).toEqual(
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
    expect(toLocalDateKey(localDate(2026, 1, 5))).toBe("2026-01-05");
  });
});
