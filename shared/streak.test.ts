import { describe, expect, it } from "vitest";
import { addDays } from "./time.ts";
import { computeStreak, type StreakWord } from "./streak.ts";

const ammar = { id: "ammar", timezone: "Europe/Stockholm" };
const camille = { id: "camille", timezone: "Europe/Stockholm" };

function wordsFor(dates: string[], authorId: string): StreakWord[] {
  return dates.map((localDate) => ({ authorId, localDate }));
}

describe("computeStreak", () => {
  const now = new Date("2026-11-19T15:00:00Z");

  it("counts a run of completed days and leaves today open", () => {
    const dates = ["2026-11-17", "2026-11-18"];
    const snap = computeStreak({
      startDate: "2026-11-17",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      now,
      words: [
        ...wordsFor(dates, "ammar"),
        ...wordsFor(dates, "camille"),
        { authorId: "ammar", localDate: "2026-11-19" },
      ],
    });
    expect(snap.today).toBe("2026-11-19");
    expect(snap.count).toBe(2);
    expect(snap.todayComplete).toBe(false);
    expect(snap.myGoalMet).toBe(true);
    expect(snap.partnerGoalMet).toBe(false);
    expect(snap.todayStatus).toBe("pending");
  });

  it("includes today once both people have filled it", () => {
    const dates = ["2026-11-18", "2026-11-19"];
    const snap = computeStreak({
      startDate: "2026-11-18",
      dailyLimit: 2,
      members: [ammar, camille],
      viewerId: "ammar",
      now,
      words: [
        ...wordsFor(dates, "ammar"),
        ...wordsFor(dates, "ammar"),
        ...wordsFor(dates, "camille"),
        ...wordsFor(dates, "camille"),
      ],
    });
    expect(snap.count).toBe(2);
    expect(snap.todayComplete).toBe(true);
    expect(snap.myCount).toBe(2);
  });

  it("does not complete a day until the daily limit is met", () => {
    const snap = computeStreak({
      startDate: "2026-11-19",
      dailyLimit: 2,
      members: [ammar, camille],
      viewerId: "ammar",
      now,
      words: [
        { authorId: "ammar", localDate: "2026-11-19" },
        { authorId: "camille", localDate: "2026-11-19" },
      ],
    });
    expect(snap.todayComplete).toBe(false);
    expect(snap.myGoalMet).toBe(false);
  });

  it("spends one freeze on the first miss of an ISO week and keeps the streak", () => {
    const missed = "2026-11-16";
    const kept = ["2026-11-15", "2026-11-17", "2026-11-18"];
    const snap = computeStreak({
      startDate: "2026-11-15",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      now,
      words: [...wordsFor(kept, "ammar"), ...wordsFor(kept, "camille")],
    });
    expect(snap.frozenDates).toEqual([missed]);
    expect(snap.freeze.used).toBe(true);
    expect(snap.freeze.available).toBe(false);
    expect(snap.count).toBe(4);
    expect(snap.brokenOn).toBeNull();
    expect(snap.days.find((day) => day.date === missed)?.status).toBe("frozen");
  });

  it("breaks on the second miss in the same week", () => {
    const kept = ["2026-11-18"];
    const snap = computeStreak({
      startDate: "2026-11-15",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      now,
      words: [...wordsFor(kept, "ammar"), ...wordsFor(kept, "camille")],
    });
    expect(snap.frozenDates).toContain("2026-11-16");
    expect(snap.count).toBe(1);
    expect(snap.brokenOn).toBe("2026-11-17");
  });

  it("lets a new week have its own freeze", () => {
    const start = "2026-11-08";
    const missedWeeks = ["2026-11-09", "2026-11-16"];
    const filled: string[] = [];
    for (let cursor = start; cursor <= "2026-11-18"; cursor = addDays(cursor, 1)) {
      if (!missedWeeks.includes(cursor)) filled.push(cursor);
    }
    const snap = computeStreak({
      startDate: start,
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      now,
      words: [...wordsFor(filled, "ammar"), ...wordsFor(filled, "camille")],
    });
    expect(snap.frozenDates).toEqual(missedWeeks);
    expect(snap.brokenOn).toBeNull();
    expect(snap.count).toBe(filled.length + missedWeeks.length);
  });

  it("keeps a day open while the person still living that date can fill it", () => {
    const nowSplit = new Date("2026-11-19T22:30:00Z");
    const ahead = { id: "ammar", timezone: "Pacific/Auckland" };
    const behind = { id: "camille", timezone: "America/Los_Angeles" };
    const snap = computeStreak({
      startDate: "2026-11-18",
      dailyLimit: 1,
      members: [ahead, behind],
      viewerId: "ammar",
      now: nowSplit,
      words: [
        { authorId: "ammar", localDate: "2026-11-18" },
        { authorId: "camille", localDate: "2026-11-18" },
        { authorId: "ammar", localDate: "2026-11-19" },
        { authorId: "camille", localDate: "2026-11-19" },
        { authorId: "ammar", localDate: "2026-11-20" },
      ],
    });
    expect(snap.today).toBe("2026-11-20");
    expect(snap.partnerToday).toBe("2026-11-19");
    expect(snap.todayStatus).toBe("pending");
    expect(snap.count).toBe(2);
    expect(snap.brokenOn).toBeNull();
  });

  it("fails a date once someone has passed it without filling their words", () => {
    const later = new Date("2026-11-20T10:00:00Z");
    const ahead = { id: "ammar", timezone: "Pacific/Auckland" };
    const behind = { id: "camille", timezone: "America/Los_Angeles" };
    const snap = computeStreak({
      startDate: "2026-11-19",
      dailyLimit: 1,
      members: [ahead, behind],
      viewerId: "camille",
      now: later,
      words: [{ authorId: "ammar", localDate: "2026-11-20" }],
    });
    expect(snap.today).toBe("2026-11-20");
    expect(snap.frozenDates).toContain("2026-11-19");
    expect(snap.count).toBe(1);
  });
});
