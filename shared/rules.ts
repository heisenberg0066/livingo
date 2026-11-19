import { LANGUAGES } from "./languages.ts";
import type { Language } from "./types.ts";

export function assertCanJoin(members: { teaches: Language }[], teaches: Language): void {
  if (members.length >= 2) {
    throw new Error("That pair already has two people.");
  }
  if (members.some((member) => member.teaches === teaches)) {
    throw new Error(`Your friend already teaches ${LANGUAGES[teaches].name}. Pick the other language.`);
  }
}

export function clampLimit(limit: number): number {
  return Math.min(5, Math.max(1, Math.round(limit)));
}
