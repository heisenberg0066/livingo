export type Language = "sv" | "fr";

export type BackendMode = "local" | "server" | "supabase";

export type AttachmentKind = "image" | "voice";

export type ReviewGrade = "again" | "good" | "easy";

export interface Pair {
  id: string;
  code: string;
  createdAt: string;
}

export interface PublicMember {
  id: string;
  pairId: string;
  displayName: string;
  teaches: Language;
  timezone: string;
  reminderHour: number;
  reminderMinute: number;
  createdAt: string;
}

export interface Streak {
  id: string;
  pairId: string;
  name: string;
  dailyLimit: number;
  startDate: string;
  starterId: string;
  createdBy: string;
  createdAt: string;
}

export interface Word {
  id: string;
  streakId: string;
  pairId: string;
  authorId: string;
  language: Language;
  text: string;
  meaning: string;
  replyText: string;
  replyLanguage: Language | null;
  replyAuthorId: string | null;
  repliedAt: string | null;
  explanation: string;
  explanationAuthorId: string | null;
  localDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  wordId: string;
  pairId: string;
  authorId: string;
  kind: AttachmentKind;
  mediaId: string;
  mimeType: string;
  durationMs: number | null;
  createdAt: string;
}

export interface SrsCard {
  id: string;
  wordId: string;
  userId: string;
  ease: number;
  interval: number;
  due: string;
  reps: number;
  lapses: number;
  lastReviewed: string | null;
}

export interface SessionState {
  me: PublicMember;
  pair: Pair;
  members: PublicMember[];
  streaks: Streak[];
  words: Word[];
  attachments: Attachment[];
  srs: SrsCard[];
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
