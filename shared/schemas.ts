import { z } from "zod";

export const languageSchema = z.enum(["sv", "fr"]);

export const displayNameSchema = z.string().trim().min(1, "Add a display name.").max(24, "Keep the name under 24 characters.");

export const createPairSchema = z.object({
  displayName: displayNameSchema,
  teaches: languageSchema,
  timezone: z.string().trim().min(1).max(80),
});

export const joinPairSchema = createPairSchema.extend({
  code: z.string().trim().min(4, "Enter the invite code.").max(12),
});

export const streakInputSchema = z.object({
  name: z.string().trim().min(1, "Name this streak.").max(40),
  dailyLimit: z.number().int().min(1).max(5),
  starterId: z.string().min(1).optional(),
});

export const wordInputSchema = z.object({
  streakId: z.string().min(1),
  text: z.string().trim().min(1, "Write the word.").max(80),
  meaning: z.string().trim().min(1, "Add the English meaning.").max(160),
});

export const wordPatchSchema = z.object({
  text: z.string().trim().min(1).max(80).optional(),
  meaning: z.string().trim().min(1).max(160).optional(),
  explanation: z.string().trim().max(2000).optional(),
  replyText: z.string().trim().min(1).max(80).optional(),
});

export const profilePatchSchema = z.object({
  displayName: displayNameSchema.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
  reminderMinute: z.number().int().min(0).max(59).optional(),
});

export const reviewSchema = z.object({
  wordId: z.string().min(1),
  grade: z.enum(["again", "good", "easy"]),
});

export const pushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
