import { describe, it, expect } from "vitest";
import {
  THIRTY_DAYS,
  parsePeriod,
  periodKey,
  resolveWindow,
  toSearch,
  validateCustom,
} from "./period";

/** AC-1…AC-4: defaults, URL round-trip, custom-range validation, window maths. */

const TODAY = "2026-10-19";

describe("parsePeriod", () => {
  it("defaults to 30 days with no period in the URL (AC-2)", () => {
    expect(parsePeriod(new URLSearchParams(""), TODAY)).toEqual(THIRTY_DAYS);
  });

  it("falls back to 30 days on a malformed or invalid value", () => {
    expect(parsePeriod(new URLSearchParams("period=bogus"), TODAY)).toEqual(THIRTY_DAYS);
    expect(parsePeriod(new URLSearchParams("period=custom&from=nope&to=2026-10-01"), TODAY)).toEqual(THIRTY_DAYS);
    expect(parsePeriod(new URLSearchParams("period=custom&from=2026-10-01&to=2026-12-31"), TODAY)).toEqual(THIRTY_DAYS);
  });

  // AC-4 on a hand-edited link: every violation falls back to 30 days instead of querying the server with it
  it("falls back to 30 days for a future end, a reversed range and one over 365 days", () => {
    expect(parsePeriod(new URLSearchParams("period=custom&from=2026-10-01&to=2026-10-20"), TODAY)).toEqual(THIRTY_DAYS);
    expect(parsePeriod(new URLSearchParams("period=custom&from=2026-10-10&to=2026-10-01"), TODAY)).toEqual(THIRTY_DAYS);
    expect(parsePeriod(new URLSearchParams("period=custom&from=2025-01-01&to=2026-01-01"), TODAY)).toEqual(THIRTY_DAYS);
  });

  it("rejects a date that is not on the calendar", () => {
    expect(validateCustom("2026-02-30", "2026-03-05", TODAY)).toBe("order");
    expect(validateCustom("2026-13-01", "2026-13-02", TODAY)).toBe("order");
    expect(parsePeriod(new URLSearchParams("period=custom&from=2026-02-30&to=2026-03-05"), TODAY)).toEqual(THIRTY_DAYS);
  });

  it("round-trips every selection through the URL (AC-3)", () => {
    for (const sel of [{ period: "1d" as const }, THIRTY_DAYS, { period: "custom" as const, from: "2026-09-01", to: "2026-09-30" }]) {
      expect(parsePeriod(toSearch(sel), TODAY)).toEqual(sel);
    }
  });
});

describe("validateCustom (AC-4)", () => {
  it("accepts a valid range, including a single day and today", () => {
    expect(validateCustom("2026-10-19", "2026-10-19", TODAY)).toBeNull();
    expect(validateCustom("2026-09-01", "2026-10-19", TODAY)).toBeNull();
  });

  it("rejects an end date in the future, a reversed range and one over 365 days", () => {
    expect(validateCustom("2026-10-01", "2026-10-20", TODAY)).toBe("future");
    expect(validateCustom("2026-10-10", "2026-10-01", TODAY)).toBe("order");
    expect(validateCustom("2025-01-01", "2026-01-01", TODAY)).toBe("tooLong"); // 366 inclusive days
  });

  it("allows exactly 365 inclusive days", () => {
    expect(validateCustom("2025-10-20", "2026-10-19", TODAY)).toBeNull();
  });
});

describe("periodKey", () => {
  it("carries the dates only for a custom range", () => {
    expect(periodKey(THIRTY_DAYS)).toBe("30d");
    expect(periodKey({ period: "custom", from: "2026-09-01", to: "2026-09-02" })).toBe("custom:2026-09-01:2026-09-02");
  });
});

describe("resolveWindow", () => {
  const now = new Date("2026-10-19T12:00:00.000Z");

  it("is the rolling 24 h and 30 x 24 h ending now", () => {
    const d = resolveWindow({ period: "1d" }, now, "UTC");
    expect(new Date(d.to).getTime() - new Date(d.from).getTime()).toBe(24 * 3_600_000);
    expect(d.to).toBe(now.toISOString());
    const m = resolveWindow(THIRTY_DAYS, now, "Europe/Kyiv");
    expect(new Date(m.to).getTime() - new Date(m.from).getTime()).toBe(30 * 24 * 3_600_000);
    expect(m.tz).toBe("Europe/Kyiv");
  });

  it("starts a custom range at local midnight and caps its end at now", () => {
    const past = resolveWindow({ period: "custom", from: "2026-09-01", to: "2026-09-02" }, now, "UTC");
    expect(new Date(past.from).getTime()).toBe(new Date(2026, 8, 1).getTime());
    expect(new Date(past.to).getTime()).toBe(new Date(2026, 8, 3).getTime());
    const today = resolveWindow({ period: "custom", from: "2026-10-19", to: "2026-10-19" }, now, "UTC");
    expect(today.to).toBe(now.toISOString());
  });
});
