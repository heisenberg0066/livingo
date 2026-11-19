import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCode, createId, normalizeCode } from "../shared/ids.ts";
import { assertCanJoin, clampLimit } from "../shared/rules.ts";
import { reviewCard } from "../shared/srs.ts";
import { localDate, localParts, isValidTimeZone } from "../shared/time.ts";
import type {
  Attachment,
  AttachmentKind,
  Language,
  Pair,
  PublicMember,
  PushSubscriptionJSON,
  ReviewGrade,
  SessionState,
  SrsCard,
  Streak,
  Word,
} from "../shared/types.ts";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface MemberRecord extends PublicMember {
  token: string;
}

interface PushRecord extends PushSubscriptionJSON {
  id: string;
  memberId: string;
  createdAt: string;
}

interface Database {
  pairs: Pair[];
  members: MemberRecord[];
  streaks: Streak[];
  words: Word[];
  attachments: Attachment[];
  srs: SrsCard[];
  push: PushRecord[];
  reminders: { memberId: string; date: string }[];
}

export type StoreEvent = { type: "word-created"; word: Word } | { type: "changed" };

interface Mutation<T> {
  result: T;
  pairId?: string;
  event?: StoreEvent;
  dropMedia?: string[];
}

const AUDIO_PREFIXES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/x-m4a", "audio/mp3"];
const IMAGE_PREFIXES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function emptyDb(): Database {
  return { pairs: [], members: [], streaks: [], words: [], attachments: [], srs: [], push: [], reminders: [] };
}

function publicMember(member: MemberRecord): PublicMember {
  const { token: _token, ...rest } = member;
  return rest;
}

function snapshot(db: Database, member: MemberRecord): SessionState {
  return {
    me: publicMember(member),
    pair: db.pairs.find((pair) => pair.id === member.pairId)!,
    members: db.members.filter((item) => item.pairId === member.pairId).map(publicMember),
    streaks: db.streaks.filter((streak) => streak.pairId === member.pairId),
    words: db.words.filter((word) => word.pairId === member.pairId),
    attachments: db.attachments.filter((item) => item.pairId === member.pairId),
    srs: db.srs.filter((card) => card.userId === member.id),
  };
}

export class Store {
  private db: Database = emptyDb();
  private chain: Promise<unknown> = Promise.resolve();
  private listener: ((pairId: string, event: StoreEvent) => void) | null = null;

  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  onPairChange(listener: (pairId: string, event: StoreEvent) => void): void {
    this.listener = listener;
  }

  async init(): Promise<void> {
    await mkdir(this.mediaDir(), { recursive: true });
    try {
      this.db = { ...emptyDb(), ...JSON.parse(await readFile(this.dbPath(), "utf8")) };
    } catch {
      this.db = emptyDb();
      await this.persist();
    }
  }

  memberFromToken(token: string): MemberRecord | null {
    return this.db.members.find((member) => member.token === token) ?? null;
  }

  async createPair(input: { displayName: string; teaches: Language; timezone: string }): Promise<{ token: string; snapshot: SessionState }> {
    this.assertZone(input.timezone);
    return this.transaction((db) => {
      const pair: Pair = { id: createId(), code: this.uniqueCode(db), createdAt: new Date().toISOString() };
      const member = this.makeMember(pair.id, input);
      db.pairs.push(pair);
      db.members.push(member);
      return { result: { token: member.token, snapshot: snapshot(db, member) }, pairId: pair.id, event: { type: "changed" } };
    });
  }

  async joinPair(input: { code: string; displayName: string; teaches: Language; timezone: string }): Promise<{ token: string; snapshot: SessionState }> {
    this.assertZone(input.timezone);
    const code = normalizeCode(input.code);
    return this.transaction((db) => {
      const pair = db.pairs.find((item) => item.code === code);
      if (!pair) throw new ApiError(404, "That code doesn't match a pair.");
      const members = db.members.filter((member) => member.pairId === pair.id);
      try {
        assertCanJoin(members, input.teaches);
      } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : "Can't join that pair.");
      }
      const member = this.makeMember(pair.id, input);
      db.members.push(member);
      return { result: { token: member.token, snapshot: snapshot(db, member) }, pairId: pair.id, event: { type: "changed" } };
    });
  }

  async getSnapshot(token: string): Promise<SessionState> {
    return snapshot(this.db, this.requireMember(token));
  }

  async createStreak(token: string, input: { name: string; dailyLimit: number }): Promise<SessionState> {
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      this.requirePartner(db, member.pairId);
      const streak: Streak = {
        id: createId(),
        pairId: member.pairId,
        name: input.name,
        dailyLimit: clampLimit(input.dailyLimit),
        startDate: localDate(member.timezone, new Date()),
        createdBy: member.id,
        createdAt: new Date().toISOString(),
      };
      db.streaks.push(streak);
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" } };
    });
  }

  async updateStreak(token: string, streakId: string, patch: { name?: string; dailyLimit?: number }): Promise<SessionState> {
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      const streak = this.requireStreak(db, member.pairId, streakId);
      if (patch.name) streak.name = patch.name;
      if (patch.dailyLimit !== undefined) streak.dailyLimit = clampLimit(patch.dailyLimit);
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" } };
    });
  }

  async deleteStreak(token: string, streakId: string): Promise<SessionState> {
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      const streak = this.requireStreak(db, member.pairId, streakId);
      const wordIds = new Set(db.words.filter((word) => word.streakId === streak.id).map((word) => word.id));
      const dropMedia = db.attachments.filter((item) => wordIds.has(item.wordId)).map((item) => item.mediaId);
      db.streaks = db.streaks.filter((item) => item.id !== streak.id);
      db.words = db.words.filter((word) => word.streakId !== streak.id);
      db.attachments = db.attachments.filter((item) => !wordIds.has(item.wordId));
      db.srs = db.srs.filter((card) => !wordIds.has(card.wordId));
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" }, dropMedia };
    });
  }

  async addWord(token: string, input: { streakId: string; text: string; meaning: string }): Promise<SessionState> {
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      this.requirePartner(db, member.pairId);
      const streak = this.requireStreak(db, member.pairId, input.streakId);
      const now = new Date().toISOString();
      const word: Word = {
        id: createId(),
        streakId: streak.id,
        pairId: member.pairId,
        authorId: member.id,
        language: member.teaches,
        text: input.text,
        meaning: input.meaning,
        explanation: "",
        explanationAuthorId: null,
        localDate: localDate(member.timezone, new Date()),
        createdAt: now,
        updatedAt: now,
      };
      db.words.push(word);
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "word-created", word } };
    });
  }

  async updateWord(
    token: string,
    wordId: string,
    patch: { text?: string; meaning?: string; explanation?: string },
  ): Promise<SessionState> {
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      const word = this.requireWord(db, member.pairId, wordId);
      if (patch.text !== undefined) word.text = patch.text;
      if (patch.meaning !== undefined) word.meaning = patch.meaning;
      if (patch.explanation !== undefined && patch.explanation !== word.explanation) {
        word.explanation = patch.explanation;
        word.explanationAuthorId = patch.explanation ? member.id : null;
      }
      word.updatedAt = new Date().toISOString();
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" } };
    });
  }

  async deleteWord(token: string, wordId: string): Promise<SessionState> {
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      this.requireWord(db, member.pairId, wordId);
      const dropMedia = db.attachments.filter((item) => item.wordId === wordId).map((item) => item.mediaId);
      db.words = db.words.filter((word) => word.id !== wordId);
      db.attachments = db.attachments.filter((item) => item.wordId !== wordId);
      db.srs = db.srs.filter((card) => card.wordId !== wordId);
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" }, dropMedia };
    });
  }

  async addAttachment(
    token: string,
    input: { wordId: string; kind: AttachmentKind; bytes: Buffer; mimeType: string; durationMs: number | null },
  ): Promise<SessionState> {
    this.assertMedia(input.kind, input.mimeType, input.bytes.length);
    const mediaId = createId();
    await writeFile(this.mediaPath(mediaId), input.bytes);
    try {
      return await this.transaction((db) => {
        const member = this.requireMember(token, db);
        this.requireWord(db, member.pairId, input.wordId);
        const attachment: Attachment = {
          id: createId(),
          wordId: input.wordId,
          pairId: member.pairId,
          authorId: member.id,
          kind: input.kind,
          mediaId,
          mimeType: input.mimeType,
          durationMs: input.durationMs,
          createdAt: new Date().toISOString(),
        };
        db.attachments.push(attachment);
        return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" } };
      });
    } catch (error) {
      await unlink(this.mediaPath(mediaId)).catch(() => undefined);
      throw error;
    }
  }

  async deleteAttachment(token: string, attachmentId: string): Promise<SessionState> {
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      const attachment = db.attachments.find((item) => item.id === attachmentId && item.pairId === member.pairId);
      if (!attachment) throw new ApiError(404, "That attachment is already gone.");
      db.attachments = db.attachments.filter((item) => item.id !== attachment.id);
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" }, dropMedia: [attachment.mediaId] };
    });
  }

  async readMedia(token: string, mediaId: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const member = this.requireMember(token);
    const attachment = this.db.attachments.find((item) => item.mediaId === mediaId && item.pairId === member.pairId);
    if (!attachment) return null;
    try {
      const bytes = await readFile(this.mediaPath(mediaId));
      return { bytes, mimeType: attachment.mimeType };
    } catch {
      return null;
    }
  }

  async review(token: string, wordId: string, grade: ReviewGrade): Promise<SessionState> {
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      this.requireWord(db, member.pairId, wordId);
      const today = localDate(member.timezone, new Date());
      const existing = db.srs.find((card) => card.wordId === wordId && card.userId === member.id);
      const next = reviewCard(existing, wordId, member.id, grade, today);
      db.srs = db.srs.filter((card) => card.id !== next.id);
      db.srs.push(next);
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" } };
    });
  }

  async updateMe(
    token: string,
    patch: { displayName?: string; timezone?: string; reminderHour?: number; reminderMinute?: number },
  ): Promise<SessionState> {
    if (patch.timezone) this.assertZone(patch.timezone);
    return this.transaction((db) => {
      const member = this.requireMember(token, db);
      if (patch.displayName) member.displayName = patch.displayName;
      if (patch.timezone) member.timezone = patch.timezone;
      if (patch.reminderHour !== undefined) member.reminderHour = patch.reminderHour;
      if (patch.reminderMinute !== undefined) member.reminderMinute = patch.reminderMinute;
      return { result: snapshot(db, member), pairId: member.pairId, event: { type: "changed" } };
    });
  }

  async savePush(token: string, subscription: PushSubscriptionJSON): Promise<void> {
    await this.transaction((db) => {
      const member = this.requireMember(token, db);
      db.push = db.push.filter((item) => item.endpoint !== subscription.endpoint);
      db.push.push({
        id: createId(),
        memberId: member.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        createdAt: new Date().toISOString(),
      });
      return { result: undefined, pairId: member.pairId, event: { type: "changed" } };
    });
  }

  async removePush(token: string, endpoint: string): Promise<void> {
    await this.transaction((db) => {
      const member = this.requireMember(token, db);
      db.push = db.push.filter((item) => !(item.memberId === member.id && item.endpoint === endpoint));
      return { result: undefined };
    });
  }

  async forgetPushEndpoint(endpoint: string): Promise<void> {
    await this.transaction((db) => {
      db.push = db.push.filter((item) => item.endpoint !== endpoint);
      return { result: undefined };
    });
  }

  displayName(memberId: string): string {
    return this.db.members.find((member) => member.id === memberId)?.displayName ?? "Your friend";
  }

  partnerSubscriptions(pairId: string, actorId: string): PushSubscriptionJSON[] {
    const ids = new Set(
      this.db.members.filter((member) => member.pairId === pairId && member.id !== actorId).map((member) => member.id),
    );
    return this.db.push
      .filter((item) => ids.has(item.memberId))
      .map((item) => ({ endpoint: item.endpoint, keys: item.keys }));
  }

  reminderCandidates(now: Date): { member: PublicMember; date: string; subs: PushRecord[] }[] {
    const due: { member: PublicMember; date: string; subs: PushRecord[] }[] = [];
    for (const member of this.db.members) {
      const parts = localParts(member.timezone, now);
      if (parts.hour !== member.reminderHour || parts.minute !== member.reminderMinute) continue;
      if (this.db.reminders.some((item) => item.memberId === member.id && item.date === parts.date)) continue;
      const streaks = this.db.streaks.filter((streak) => streak.pairId === member.pairId);
      if (streaks.length === 0) continue;
      const missing = streaks.some((streak) => {
        const count = this.db.words.filter(
          (word) => word.streakId === streak.id && word.authorId === member.id && word.localDate === parts.date,
        ).length;
        return count < streak.dailyLimit;
      });
      if (!missing) continue;
      const subs = this.db.push.filter((item) => item.memberId === member.id);
      if (subs.length === 0) continue;
      due.push({ member: publicMember(member), date: parts.date, subs });
    }
    return due;
  }

  async claimReminder(memberId: string, date: string): Promise<boolean> {
    return this.transaction((db) => {
      if (db.reminders.some((item) => item.memberId === memberId && item.date === date)) {
        return { result: false };
      }
      db.reminders.push({ memberId, date });
      return { result: true };
    });
  }

  private assertZone(timeZone: string): void {
    if (!isValidTimeZone(timeZone)) throw new ApiError(400, "Pick a valid time zone.");
  }

  private assertMedia(kind: AttachmentKind, mimeType: string, size: number): void {
    const allowed = kind === "image" ? IMAGE_PREFIXES : AUDIO_PREFIXES;
    const ok = allowed.some((prefix) => mimeType.toLowerCase().startsWith(prefix));
    if (!ok) throw new ApiError(400, kind === "image" ? "Use a JPEG, PNG, or WebP picture." : "That audio format isn't supported.");
    const limit = kind === "image" ? 4_000_000 : 3_000_000;
    if (size > limit) throw new ApiError(413, "That file is too big for a card.");
    if (size === 0) throw new ApiError(400, "That file was empty.");
  }

  private requireMember(token: string, db: Database = this.db): MemberRecord {
    const member = db.members.find((item) => item.token === token);
    if (!member) throw new ApiError(401, "That session expired. Join again.");
    return member;
  }

  private requirePartner(db: Database, pairId: string): void {
    if (db.members.filter((member) => member.pairId === pairId).length < 2) {
      throw new ApiError(400, "Wait for your friend to join, then you can start together.");
    }
  }

  private requireStreak(db: Database, pairId: string, streakId: string): Streak {
    const streak = db.streaks.find((item) => item.id === streakId && item.pairId === pairId);
    if (!streak) throw new ApiError(404, "That streak isn't on this pair.");
    return streak;
  }

  private requireWord(db: Database, pairId: string, wordId: string): Word {
    const word = db.words.find((item) => item.id === wordId && item.pairId === pairId);
    if (!word) throw new ApiError(404, "That card is gone.");
    return word;
  }

  private makeMember(pairId: string, input: { displayName: string; teaches: Language; timezone: string }): MemberRecord {
    return {
      id: createId(),
      pairId,
      displayName: input.displayName.trim(),
      teaches: input.teaches,
      timezone: input.timezone,
      reminderHour: 20,
      reminderMinute: 0,
      createdAt: new Date().toISOString(),
      token: `${createId()}${createId()}`,
    };
  }

  private uniqueCode(db: Database): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = createCode(6);
      if (!db.pairs.some((pair) => pair.code === code)) return code;
    }
    return createCode(8);
  }

  private async transaction<T>(fn: (db: Database) => Mutation<T> | Promise<Mutation<T>>): Promise<T> {
    const outcome = await this.lock(async () => {
      const mutation = await fn(this.db);
      await this.persist();
      return mutation;
    });
    if (outcome.dropMedia?.length) {
      await Promise.all(outcome.dropMedia.map((id) => unlink(this.mediaPath(id)).catch(() => undefined)));
    }
    if (outcome.pairId && outcome.event) this.listener?.(outcome.pairId, outcome.event);
    return outcome.result;
  }

  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private dbPath(): string {
    return join(this.dir, "db.json");
  }

  private mediaDir(): string {
    return join(this.dir, "media");
  }

  private mediaPath(id: string): string {
    return join(this.mediaDir(), id);
  }

  private async persist(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.dbPath(), JSON.stringify(this.db, null, 2));
  }
}
