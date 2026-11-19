import { openDB, type DBSchema } from "idb";
import { createCode, createId, normalizeCode } from "../../../shared/ids.ts";
import { assertCanJoin, clampLimit } from "../../../shared/rules.ts";
import { reviewCard } from "../../../shared/srs.ts";
import { isValidTimeZone, localDate } from "../../../shared/time.ts";
import type {
  Attachment,
  Pair,
  PublicMember,
  PushSubscriptionJSON,
  ReviewGrade,
  SessionState,
  SrsCard,
  Streak,
  Word,
} from "../../../shared/types.ts";
import { buildDemo, DEMO_PAIR } from "../demo.ts";
import type { AttachmentInput, LivingoRepo, PersonInput } from "./types.ts";

interface MemberRecord extends PublicMember {
  token: string;
}

interface LocalDatabase {
  pairs: Pair[];
  members: MemberRecord[];
  streaks: Streak[];
  words: Word[];
  attachments: Attachment[];
  srs: SrsCard[];
}

interface Schema extends DBSchema {
  kv: { key: string; value: LocalDatabase };
  media: { key: string; value: { blob: Blob; mimeType: string } };
}

const TOKEN_KEY = "livingo.localToken";
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("livingo-local") : null;

function emptyDb(): LocalDatabase {
  return { pairs: [], members: [], streaks: [], words: [], attachments: [], srs: [] };
}

function database() {
  return openDB<Schema>("livingo", 1, {
    upgrade(db) {
      db.createObjectStore("kv");
      db.createObjectStore("media");
    },
  });
}

function toPublic(member: MemberRecord): PublicMember {
  return {
    id: member.id,
    pairId: member.pairId,
    displayName: member.displayName,
    teaches: member.teaches,
    timezone: member.timezone,
    reminderHour: member.reminderHour,
    reminderMinute: member.reminderMinute,
    createdAt: member.createdAt,
  };
}

function snapshot(db: LocalDatabase, member: MemberRecord): SessionState {
  return {
    me: toPublic(member),
    pair: db.pairs.find((pair) => pair.id === member.pairId)!,
    members: db.members.filter((item) => item.pairId === member.pairId).map(toPublic),
    streaks: db.streaks.filter((streak) => streak.pairId === member.pairId),
    words: db.words.filter((word) => word.pairId === member.pairId),
    attachments: db.attachments.filter((item) => item.pairId === member.pairId),
    srs: db.srs.filter((card) => card.userId === member.id),
  };
}

export function createLocalRepo(): LivingoRepo {
  const read = async () => {
    const db = await database();
    return (await db.get("kv", "db")) ?? emptyDb();
  };
  const write = async (value: LocalDatabase) => {
    const db = await database();
    await db.put("kv", value, "db");
    channel?.postMessage({ type: "changed" });
  };
  const token = () => localStorage.getItem(TOKEN_KEY);
  const memberOf = (db: LocalDatabase, value = token()) => db.members.find((item) => item.token === value) ?? null;
  const requireMember = (db: LocalDatabase) => {
    const member = memberOf(db);
    if (!member) throw new Error("That session expired. Join again.");
    return member;
  };
  const requirePartner = (db: LocalDatabase, pairId: string) => {
    if (db.members.filter((item) => item.pairId === pairId).length < 2) {
      throw new Error("Wait for your friend to join, then you can start together.");
    }
  };
  const zone = (value: string) => {
    if (!isValidTimeZone(value)) throw new Error("Pick a valid time zone.");
  };
  const makeMember = (pairId: string, input: PersonInput): MemberRecord => ({
    id: createId(),
    pairId,
    displayName: input.displayName.trim(),
    teaches: input.teaches,
    timezone: input.timezone,
    reminderHour: 20,
    reminderMinute: 0,
    createdAt: new Date().toISOString(),
    token: createId(),
  });

  const current = async () => {
    const db = await read();
    const member = memberOf(db);
    return member ? snapshot(db, member) : null;
  };

  return {
    mode: "local",
    load: current,
    reload: current,
    subscribe(listener) {
      const onMessage = () => listener();
      channel?.addEventListener("message", onMessage);
      const onStorage = (event: StorageEvent) => {
        if (event.key === TOKEN_KEY) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        channel?.removeEventListener("message", onMessage);
        window.removeEventListener("storage", onStorage);
      };
    },
    async createPair(input) {
      zone(input.timezone);
      const db = await read();
      let code = createCode();
      for (let attempt = 0; attempt < 8 && db.pairs.some((pair) => pair.code === code); attempt += 1) code = createCode();
      const pair: Pair = { id: createId(), code, createdAt: new Date().toISOString() };
      const member = makeMember(pair.id, input);
      db.pairs.push(pair);
      db.members.push(member);
      await write(db);
      localStorage.setItem(TOKEN_KEY, member.token);
      return snapshot(db, member);
    },
    async joinPair(input) {
      zone(input.timezone);
      const db = await read();
      const code = normalizeCode(input.code);
      const pair = db.pairs.find((item) => item.code === code);
      if (!pair) throw new Error("That code doesn't match a pair.");
      const members = db.members.filter((item) => item.pairId === pair.id);
      assertCanJoin(members, input.teaches);
      const member = makeMember(pair.id, input);
      db.members.push(member);
      await write(db);
      localStorage.setItem(TOKEN_KEY, member.token);
      return snapshot(db, member);
    },
    async createStreak(input) {
      const db = await read();
      const member = requireMember(db);
      requirePartner(db, member.pairId);
      const streak: Streak = {
        id: createId(),
        pairId: member.pairId,
        name: input.name.trim(),
        dailyLimit: clampLimit(input.dailyLimit),
        startDate: localDate(member.timezone, new Date()),
        createdBy: member.id,
        createdAt: new Date().toISOString(),
      };
      db.streaks.push(streak);
      await write(db);
      return snapshot(db, member);
    },
    async updateStreak(id, patch) {
      const db = await read();
      const member = requireMember(db);
      const streak = db.streaks.find((item) => item.id === id && item.pairId === member.pairId);
      if (!streak) throw new Error("That streak isn't on this pair.");
      if (patch.name) streak.name = patch.name.trim();
      if (patch.dailyLimit !== undefined) streak.dailyLimit = clampLimit(patch.dailyLimit);
      await write(db);
      return snapshot(db, member);
    },
    async deleteStreak(id) {
      const db = await read();
      const member = requireMember(db);
      const wordIds = new Set(db.words.filter((word) => word.streakId === id).map((word) => word.id));
      const mediaIds = db.attachments.filter((item) => wordIds.has(item.wordId)).map((item) => item.mediaId);
      db.streaks = db.streaks.filter((item) => item.id !== id);
      db.words = db.words.filter((word) => word.streakId !== id);
      db.attachments = db.attachments.filter((item) => !wordIds.has(item.wordId));
      db.srs = db.srs.filter((card) => !wordIds.has(card.wordId));
      await write(db);
      const store = await database();
      await Promise.all(mediaIds.map((mediaId) => store.delete("media", mediaId)));
      return snapshot(db, member);
    },
    async addWord(input) {
      const db = await read();
      const member = requireMember(db);
      requirePartner(db, member.pairId);
      if (!input.text.trim() || !input.meaning.trim()) throw new Error("Write the word and the English meaning.");
      if (!db.streaks.some((streak) => streak.id === input.streakId && streak.pairId === member.pairId)) {
        throw new Error("That streak isn't on this pair.");
      }
      const now = new Date().toISOString();
      const word: Word = {
        id: createId(),
        streakId: input.streakId,
        pairId: member.pairId,
        authorId: member.id,
        language: member.teaches,
        text: input.text.trim(),
        meaning: input.meaning.trim(),
        explanation: "",
        explanationAuthorId: null,
        localDate: localDate(member.timezone, new Date()),
        createdAt: now,
        updatedAt: now,
      };
      db.words.push(word);
      await write(db);
      return snapshot(db, member);
    },
    async updateWord(id, patch) {
      const db = await read();
      const member = requireMember(db);
      const word = db.words.find((item) => item.id === id && item.pairId === member.pairId);
      if (!word) throw new Error("That card is gone.");
      if (patch.text !== undefined) word.text = patch.text.trim();
      if (patch.meaning !== undefined) word.meaning = patch.meaning.trim();
      if (patch.explanation !== undefined && patch.explanation !== word.explanation) {
        word.explanation = patch.explanation.trim();
        word.explanationAuthorId = word.explanation ? member.id : null;
      }
      word.updatedAt = new Date().toISOString();
      await write(db);
      return snapshot(db, member);
    },
    async deleteWord(id) {
      const db = await read();
      const member = requireMember(db);
      const mediaIds = db.attachments.filter((item) => item.wordId === id).map((item) => item.mediaId);
      db.words = db.words.filter((word) => word.id !== id);
      db.attachments = db.attachments.filter((item) => item.wordId !== id);
      db.srs = db.srs.filter((card) => card.wordId !== id);
      await write(db);
      const store = await database();
      await Promise.all(mediaIds.map((mediaId) => store.delete("media", mediaId)));
      return snapshot(db, member);
    },
    async addAttachment(input: AttachmentInput) {
      const db = await read();
      const member = requireMember(db);
      if (!db.words.some((word) => word.id === input.wordId && word.pairId === member.pairId)) {
        throw new Error("That card is gone.");
      }
      const mediaId = createId();
      const store = await database();
      await store.put("media", { blob: input.blob, mimeType: input.mimeType }, mediaId);
      db.attachments.push({
        id: createId(),
        wordId: input.wordId,
        pairId: member.pairId,
        authorId: member.id,
        kind: input.kind,
        mediaId,
        mimeType: input.mimeType,
        durationMs: input.durationMs ?? null,
        createdAt: new Date().toISOString(),
      });
      await write(db);
      return snapshot(db, member);
    },
    async deleteAttachment(id) {
      const db = await read();
      const member = requireMember(db);
      const attachment = db.attachments.find((item) => item.id === id && item.pairId === member.pairId);
      if (!attachment) throw new Error("That attachment is already gone.");
      db.attachments = db.attachments.filter((item) => item.id !== id);
      await write(db);
      const store = await database();
      await store.delete("media", attachment.mediaId);
      return snapshot(db, member);
    },
    async getMedia(mediaId) {
      const store = await database();
      const media = await store.get("media", mediaId);
      if (!media) throw new Error("That file is missing.");
      return media.blob;
    },
    async review(wordId, grade: ReviewGrade) {
      const db = await read();
      const member = requireMember(db);
      if (!db.words.some((word) => word.id === wordId && word.pairId === member.pairId)) {
        throw new Error("That card is gone.");
      }
      const today = localDate(member.timezone, new Date());
      const existing = db.srs.find((card) => card.wordId === wordId && card.userId === member.id);
      const next = reviewCard(existing, wordId, member.id, grade, today);
      db.srs = db.srs.filter((card) => card.id !== next.id);
      db.srs.push(next);
      await write(db);
      return snapshot(db, member);
    },
    async updateMe(patch) {
      if (patch.timezone) zone(patch.timezone);
      const db = await read();
      const member = requireMember(db);
      if (patch.displayName) member.displayName = patch.displayName.trim();
      if (patch.timezone) member.timezone = patch.timezone;
      if (patch.reminderHour !== undefined) member.reminderHour = patch.reminderHour;
      if (patch.reminderMinute !== undefined) member.reminderMinute = patch.reminderMinute;
      await write(db);
      return snapshot(db, member);
    },
    async savePush(_subscription: PushSubscriptionJSON) {
      return;
    },
    async signOut() {
      localStorage.removeItem(TOKEN_KEY);
      channel?.postMessage({ type: "changed" });
    },
    async switchUser(memberId) {
      const db = await read();
      const member = requireMember(db);
      const next = db.members.find((item) => item.id === memberId && item.pairId === member.pairId);
      if (!next) throw new Error("That person isn't in this pair.");
      localStorage.setItem(TOKEN_KEY, next.token);
      channel?.postMessage({ type: "changed" });
      return snapshot(db, next);
    },
    async loadDemo(timezone) {
      zone(timezone);
      const db = await read();
      db.pairs = db.pairs.filter((pair) => pair.id !== DEMO_PAIR);
      db.members = db.members.filter((member) => member.pairId !== DEMO_PAIR);
      db.streaks = db.streaks.filter((streak) => streak.pairId !== DEMO_PAIR);
      db.words = db.words.filter((word) => word.pairId !== DEMO_PAIR);
      db.attachments = db.attachments.filter((item) => item.pairId !== DEMO_PAIR);
      db.srs = db.srs.filter((card) => card.userId !== "member-ammar" && card.userId !== "member-camille");
      const demo = await buildDemo(timezone);
      db.pairs.push(demo.pair);
      db.members.push(...demo.members);
      db.streaks.push(...demo.streaks);
      db.words.push(...demo.words);
      db.attachments.push(...demo.attachments);
      db.srs.push(...demo.srs);
      const store = await database();
      for (const item of demo.media) {
        await store.put("media", { blob: item.blob, mimeType: item.mimeType }, item.id);
      }
      await write(db);
      const ammar = db.members.find((item) => item.token === "demo-token-ammar");
      if (!ammar) throw new Error("The sample pair couldn't be opened.");
      localStorage.setItem(TOKEN_KEY, ammar.token);
      channel?.postMessage({ type: "changed" });
      return snapshot(db, ammar);
    },
  };
}
