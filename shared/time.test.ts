import { describe, expect, it } from "vitest";
import { isoWeekKey, localDate, nextReminderInstant, zonedTimeToUtc } from "./time.ts";

describe("local dates", () => {
  const now = new Date("2026-11-19T22:30:00Z");

  it("stamps each zone with its own calendar date", () => {
    expect(localDate("America/Los_Angeles", now)).toBe("2026-11-19");
    expect(localDate("Europe/Stockholm", now)).toBe("2026-11-19");
    expect(localDate("Pacific/Auckland", now)).toBe("2026-11-20");
  });

  it("converts a zoned clock time to UTC", () => {
    expect(zonedTimeToUtc("2026-11-19", 20, 0, "Europe/Stockholm").toISOString()).toBe(
      "2026-11-19T19:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-11-19", 20, 0, "America/Los_Angeles").toISOString()).toBe(
      "2026-11-20T04:00:00.000Z",
    );
  });

  it("schedules the next reminder after the chosen minute", () => {
    const before = new Date("2026-11-19T18:00:00.000Z");
    const next = nextReminderInstant("Europe/Stockholm", 20, 0, before, false);
    expect(next.toISOString()).toBe("2026-11-19T19:00:00.000Z");

    const after = new Date("2026-11-19T19:30:00.000Z");
    const tomorrow = nextReminderInstant("Europe/Stockholm", 20, 0, after, false);
    expect(tomorrow.toISOString()).toBe("2026-11-20T19:00:00.000Z");
  });

  it("uses ISO weeks that start on Monday", () => {
    expect(isoWeekKey("2026-11-16")).toBe(isoWeekKey("2026-11-19"));
    expect(isoWeekKey("2026-11-15")).not.toBe(isoWeekKey("2026-11-16"));
  });
});
