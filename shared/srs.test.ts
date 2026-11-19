import { describe, expect, it } from "vitest";
import { reviewCard, splitQueue } from "./srs.ts";

describe("spaced repetition", () => {
  it("brings a miss back tomorrow and grows a remembered card", () => {
    const first = reviewCard(undefined, "word-1", "ammar", "good", "2026-11-19");
    expect(first.due).toBe("2026-11-20");
    expect(first.interval).toBe(1);
    const second = reviewCard(first, "word-1", "ammar", "good", "2026-11-20");
    expect(second.interval).toBe(3);
    expect(second.due).toBe("2026-11-23");
    const missed = reviewCard(second, "word-1", "ammar", "again", "2026-11-23");
    expect(missed.reps).toBe(0);
    expect(missed.lapses).toBe(1);
    expect(missed.due).toBe("2026-11-24");
  });

  it("queues due cards and holds the ones scheduled later", () => {
    const words = [
      { id: "a", language: "fr" as const },
      { id: "b", language: "fr" as const },
      { id: "c", language: "sv" as const },
    ];
    const split = splitQueue(
      words,
      [
        { wordId: "a", due: "2026-11-18" },
        { wordId: "b", due: "2026-11-25" },
      ],
      "2026-11-19",
      "fr",
    );
    expect(split.due.map((word) => word.id)).toEqual(["a"]);
    expect(split.later.map((word) => word.id)).toEqual(["b"]);
  });
});
