import { describe, expect, it } from "vitest";
import { addDays } from "./time.ts";
import { computeStreak, type TurnMember, type TurnWord } from "./streak.ts";

const ammar: TurnMember = { id: "ammar", timezone: "Europe/Stockholm", teaches: "sv", displayName: "Ammar" };
const camille: TurnMember = { id: "camille", timezone: "Europe/Stockholm", teaches: "fr", displayName: "Camille" };

function card(date: string, authorId: string, replied: boolean, id = `${authorId}-${date}`): TurnWord {
  return { id, authorId, localDate: date, replyText: replied ? "oui" : "" };
}

describe("alternating streak", () => {
  const now = new Date("2026-11-19T15:00:00Z");

  it("asks the starter to post on the start date and the other person the next day", () => {
    const posting = computeStreak({
      startDate: "2026-11-19",
      starterId: "ammar",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      words: [],
      now,
    });
    expect(posting.turn.kind).toBe("post");
    expect(posting.turn.headline).toBe("Your turn to post a Swedish word");

    const waiting = computeStreak({
      startDate: "2026-11-19",
      starterId: "ammar",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "camille",
      words: [],
      now,
    });
    expect(waiting.turn.kind).toBe("waiting-post");
    expect(waiting.turn.headline).toBe("Waiting for Ammar's Swedish word");
  });

  it("counts a day only after the reply, and tells the partner to reply", () => {
    const posted = computeStreak({
      startDate: "2026-11-19",
      starterId: "camille",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      words: [card("2026-11-19", "camille", false, "bonjour")],
      now,
    });
    expect(posted.turn.kind).toBe("reply");
    expect(posted.turn.headline).toBe("Reply to Camille's word in Swedish");
    expect(posted.turn.replyWordIds).toEqual(["bonjour"]);
    expect(posted.count).toBe(0);

    const done = computeStreak({
      startDate: "2026-11-19",
      starterId: "camille",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      words: [card("2026-11-19", "camille", true, "bonjour")],
      now,
    });
    expect(done.turn.kind).toBe("complete");
    expect(done.count).toBe(1);
    expect(done.todayComplete).toBe(true);
  });

  it("flips who posts the next day", () => {
    const tomorrow = new Date("2026-11-20T15:00:00Z");
    const snap = computeStreak({
      startDate: "2026-11-19",
      starterId: "camille",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      words: [card("2026-11-19", "camille", true)],
      now: tomorrow,
    });
    expect(snap.turn.kind).toBe("post");
    expect(snap.turn.headline).toBe("Your turn to post a Swedish word");
    expect(snap.count).toBe(1);
  });

  it("keeps the reply window open through the replier's next calendar day", () => {
    const later = new Date("2026-11-20T15:00:00Z");
    const snap = computeStreak({
      startDate: "2026-11-19",
      starterId: "camille",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      words: [card("2026-11-19", "camille", false, "bonjour")],
      now: later,
    });
    expect(snap.turn.kind).toBe("reply");
    expect(snap.days.find((day) => day.date === "2026-11-19")?.status).toBe("pending");
  });

  it("spends one freeze when a posting day is missed and continues", () => {
    const words = [card("2026-11-17", "camille", true), card("2026-11-18", "ammar", true)];
    const snap = computeStreak({
      startDate: "2026-11-16",
      starterId: "ammar",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "ammar",
      words,
      now,
    });
    expect(snap.frozenDates).toEqual(["2026-11-16"]);
    expect(snap.freeze.available).toBe(false);
    expect(snap.count).toBe(3);
    expect(snap.turn.kind).toBe("waiting-post");
  });

  it("fails a day once the reply window has closed", () => {
    const later = new Date("2026-11-21T15:00:00Z");
    const snap = computeStreak({
      startDate: "2026-11-19",
      starterId: "camille",
      dailyLimit: 1,
      members: [ammar, camille],
      viewerId: "camille",
      words: [card("2026-11-19", "camille", false)],
      now: later,
    });
    expect(snap.frozenDates).toContain("2026-11-19");
    expect(snap.turn.date).toBe("2026-11-21");
  });

  it("does not let the person who is ahead close the replier's window early", () => {
    const split = new Date("2026-11-19T22:30:00Z");
    const ahead = { ...ammar, timezone: "Pacific/Auckland" };
    const behind = { ...camille, timezone: "America/Los_Angeles" };
    const snap = computeStreak({
      startDate: "2026-11-20",
      starterId: "ammar",
      dailyLimit: 1,
      members: [ahead, behind],
      viewerId: "camille",
      words: [card("2026-11-20", "ammar", false, "hej")],
      now: split,
    });
    expect(snap.turn.kind).toBe("reply");
    expect(snap.today).toBe("2026-11-19");
    expect(addDays("2026-11-20", 1)).toBe("2026-11-21");
  });
});
