import { addDays } from "./time.ts";
import type { Language, ReviewGrade, SrsCard } from "./types.ts";

export function reviewCard(
  existing: SrsCard | undefined,
  wordId: string,
  userId: string,
  grade: ReviewGrade,
  today: string,
): SrsCard {
  const base: SrsCard = existing ?? {
    id: `${userId}:${wordId}`,
    wordId,
    userId,
    ease: 2.5,
    interval: 0,
    due: today,
    reps: 0,
    lapses: 0,
    lastReviewed: null,
  };

  if (grade === "again") {
    return {
      ...base,
      reps: 0,
      lapses: base.lapses + 1,
      interval: 1,
      ease: Math.max(1.3, Math.round((base.ease - 0.2) * 100) / 100),
      due: addDays(today, 1),
      lastReviewed: today,
    };
  }

  const reps = base.reps + 1;
  let interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(1, Math.round(base.interval * base.ease));
  let ease = base.ease;
  if (grade === "easy") {
    ease = Math.round((base.ease + 0.15) * 100) / 100;
    interval = Math.max(interval + 1, Math.round(interval * 1.3));
  }
  return {
    ...base,
    reps,
    interval,
    ease,
    due: addDays(today, interval),
    lastReviewed: today,
  };
}

export function splitQueue<T extends { id: string; language: Language }>(
  words: T[],
  srs: Pick<SrsCard, "wordId" | "due">[],
  today: string,
  language: Language | "both",
): { due: T[]; later: T[] } {
  const pool = language === "both" ? words : words.filter((word) => word.language === language);
  const due: T[] = [];
  const later: T[] = [];
  for (const word of pool) {
    const card = srs.find((item) => item.wordId === word.id);
    if (!card || card.due <= today) due.push(word);
    else later.push(word);
  }
  return { due, later };
}
