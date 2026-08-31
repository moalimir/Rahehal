import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatMinorAmount,
  majorAmountToMinor,
  minorAmountToMajor,
  tehranDateInput,
  tehranEndOfDayToIso,
  tehranStartOfDayToIso,
  tehranWallClockToIso,
} from "@/lib/challenges/model";

/**
 * Deadlines are the one field a solver plans around, so the conversion between
 * a Tehran wall clock and the stored instant has to survive a round trip in
 * both directions. Before this, a date-only deadline was stored as midnight
 * UTC — 03:30 the same morning in Tehran — and rendered in whatever zone the
 * reader's browser happened to use.
 */
describe("Tehran deadline handling", () => {
  it("stores a date-only deadline as the end of that day in Tehran", () => {
    expect(tehranEndOfDayToIso("2030-06-01")).toBe("2030-06-01T20:29:59.999Z");
  });

  it("stores a date-only start date as the beginning of that day in Tehran", () => {
    expect(tehranStartOfDayToIso("2030-06-01")).toBe("2030-05-31T20:30:00.000Z");
  });

  it("reads a datetime-local value as Tehran time, not the browser's zone", () => {
    expect(tehranWallClockToIso("2030-03-01T12:00")).toBe("2030-03-01T08:30:00.000Z");
  });

  it("round-trips both date fields back to the same calendar day", () => {
    // The start-of-day case is the one a naive `slice(0, 10)` gets wrong: the
    // stored instant falls on the previous UTC day.
    expect(tehranDateInput(tehranStartOfDayToIso("2030-06-01"))).toBe("2030-06-01");
    expect(tehranDateInput(tehranEndOfDayToIso("2030-06-01"))).toBe("2030-06-01");
  });

  it("rejects an unparseable wall-clock value instead of inventing an instant", () => {
    expect(tehranWallClockToIso("")).toBeNull();
    expect(tehranWallClockToIso("not-a-date")).toBeNull();
    expect(tehranDateInput("not-a-date")).toBe("");
    expect(tehranDateInput(null)).toBe("");
  });

  it("formats an instant in Tehran regardless of the runtime zone", () => {
    // 2030-06-01T20:29:59.999Z is 23:59 on 11 Khordad in Tehran. Rendered in
    // UTC it would read 20:29, and a day earlier anywhere west of Greenwich.
    const formatted = formatDateTime("2030-06-01T20:29:59.999Z");
    expect(formatted).toContain("۲۳:۵۹");
    expect(formatted).toContain("۱۱ خرداد ۱۴۰۹");
  });
});

/**
 * The intake form takes a major-unit amount and the API stores integer minor
 * units. Previously the typed value went straight into `amount_minor` and came
 * back out unscaled — self-consistent, and off by 100 the moment anything
 * applied the real scale.
 */
describe("budget minor units", () => {
  it("scales a typed major amount into integer minor units", () => {
    expect(majorAmountToMinor("850000000")).toBe(85_000_000_000);
  });

  it("accepts Persian digits and thousands separators", () => {
    expect(majorAmountToMinor("۲٬۵۰۰٬۰۰۰")).toBe(250_000_000);
  });

  it("round-trips a stored amount back to the value that was typed", () => {
    expect(minorAmountToMajor(majorAmountToMinor("2500000") ?? 0)).toBe(2_500_000);
  });

  it("displays the major unit, not the raw stored integer", () => {
    expect(formatMinorAmount(85_000_000_000)).toBe("۸۵۰٬۰۰۰٬۰۰۰");
  });

  it("refuses an amount it cannot represent exactly", () => {
    expect(majorAmountToMinor("")).toBeNull();
    expect(majorAmountToMinor("-5")).toBeNull();
    expect(majorAmountToMinor("abc")).toBeNull();
    expect(majorAmountToMinor(String(Number.MAX_SAFE_INTEGER))).toBeNull();
  });
});
