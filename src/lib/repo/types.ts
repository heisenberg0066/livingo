import type {
  AttachmentKind,
  BackendMode,
  PushSubscriptionJSON,
  ReviewGrade,
  SessionState,
} from "../../../shared/types.ts";

export interface PersonInput {
  displayName: string;
  teaches: "sv" | "fr";
  timezone: string;
}

export interface AttachmentInput {
  wordId: string;
  kind: AttachmentKind;
  blob: Blob;
  mimeType: string;
  durationMs?: number | null;
}

export interface LivingoRepo {
  readonly mode: BackendMode;
  load(): Promise<SessionState | null>;
  reload(): Promise<SessionState | null>;
  subscribe(listener: () => void): () => void;
  createPair(input: PersonInput): Promise<SessionState>;
  joinPair(input: PersonInput & { code: string }): Promise<SessionState>;
  createStreak(input: { name: string; dailyLimit: number; starterId?: string }): Promise<SessionState>;
  updateStreak(id: string, patch: { name?: string; dailyLimit?: number }): Promise<SessionState>;
  deleteStreak(id: string): Promise<SessionState>;
  addWord(input: { streakId: string; text: string; meaning: string }): Promise<SessionState>;
  updateWord(id: string, patch: { text?: string; meaning?: string; explanation?: string; replyText?: string }): Promise<SessionState>;
  deleteWord(id: string): Promise<SessionState>;
  addAttachment(input: AttachmentInput): Promise<SessionState>;
  deleteAttachment(id: string): Promise<SessionState>;
  getMedia(mediaId: string): Promise<Blob>;
  review(wordId: string, grade: ReviewGrade): Promise<SessionState>;
  updateMe(patch: {
    displayName?: string;
    timezone?: string;
    reminderHour?: number;
    reminderMinute?: number;
  }): Promise<SessionState>;
  savePush(subscription: PushSubscriptionJSON): Promise<void>;
  signOut(): Promise<void>;
  switchUser?(memberId: string): Promise<SessionState>;
  loadDemo?(timezone: string): Promise<SessionState>;
}
