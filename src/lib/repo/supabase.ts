import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { createId } from "../../../shared/ids.ts";
import { clampLimit } from "../../../shared/rules.ts";
import { reviewCard } from "../../../shared/srs.ts";
import { localDate } from "../../../shared/time.ts";
import type {
  Attachment,
  Language,
  Pair,
  PublicMember,
  PushSubscriptionJSON,
  ReviewGrade,
  SessionState,
  SrsCard,
  Streak,
  Word,
} from "../../../shared/types.ts";
import type { AttachmentInput, LivingoRepo } from "./types.ts";

interface MemberRow {
  id: string;
  pair_id: string;
  display_name: string;
  teaches: Language;
  timezone: string;
  reminder_hour: number;
  reminder_minute: number;
  created_at: string;
}

function fail(error: { message: string } | null, fallback: string): void {
  if (!error) return;
  const message = error.message || fallback;
  if (/schema cache|could not find the table|does not exist/i.test(message)) {
    throw new Error("Supabase doesn't have the Livingo tables yet. Run supabase/schema.sql in the SQL editor, then try again.");
  }
  throw new Error(message);
}

function mapMember(row: MemberRow): PublicMember {
  return {
    id: row.id,
    pairId: row.pair_id,
    displayName: row.display_name,
    teaches: row.teaches,
    timezone: row.timezone,
    reminderHour: row.reminder_hour,
    reminderMinute: row.reminder_minute,
    createdAt: row.created_at,
  };
}

export function createSupabaseRepo(url: string, anonKey: string): LivingoRepo {
  if (!url || !anonKey) {
    throw new Error("Add the Supabase project URL and anon key in Connection.");
  }
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  let state: SessionState | null = null;
  let channel: RealtimeChannel | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  async function userId(): Promise<string> {
    const existing = await client.auth.getSession();
    if (existing.data.session?.user.id) return existing.data.session.user.id;
    const signed = await client.auth.signInAnonymously();
    if (signed.error || !signed.data.user) {
      throw new Error(signed.error?.message || "Turn on anonymous sign-ins in the Supabase project.");
    }
    return signed.data.user.id;
  }

  async function fetchState(): Promise<SessionState | null> {
    const session = await client.auth.getSession();
    const uid = session.data.session?.user.id;
    if (!uid) return null;
    const memberResult = await client.from("members").select("*").eq("user_id", uid).maybeSingle();
    fail(memberResult.error, "Couldn't read your profile.");
    const row = memberResult.data as MemberRow | null;
    if (!row) return null;
    const pairId = row.pair_id;
    const [pairResult, membersResult, streaksResult, wordsResult, attachmentsResult, srsResult] = await Promise.all([
      client.from("pairs").select("*").eq("id", pairId).single(),
      client.from("members").select("*").eq("pair_id", pairId),
      client.from("streaks").select("*").eq("pair_id", pairId),
      client.from("words").select("*").eq("pair_id", pairId),
      client.from("attachments").select("*").eq("pair_id", pairId),
      client.from("srs_states").select("*").eq("member_id", row.id),
    ]);
    fail(pairResult.error, "Couldn't read the pair.");
    fail(membersResult.error, "Couldn't read the pair.");
    fail(streaksResult.error, "Couldn't read streaks.");
    fail(wordsResult.error, "Couldn't read words.");
    fail(attachmentsResult.error, "Couldn't read attachments.");
    fail(srsResult.error, "Couldn't read reviews.");
    const pairRow = pairResult.data as { id: string; code: string; created_at: string };
    const pair: Pair = { id: pairRow.id, code: pairRow.code, createdAt: pairRow.created_at };
    const members = ((membersResult.data ?? []) as MemberRow[]).map(mapMember);
    const streaks = ((streaksResult.data ?? []) as Record<string, unknown>[]).map(mapStreak);
    const words = ((wordsResult.data ?? []) as Record<string, unknown>[]).map(mapWord);
    const attachments = ((attachmentsResult.data ?? []) as Record<string, unknown>[]).map(mapAttachment);
    const srs = ((srsResult.data ?? []) as Record<string, unknown>[]).map(mapSrs);
    return { me: mapMember(row), pair, members, streaks, words, attachments, srs };
  }

  function ensureChannel() {
    if (!state || channel) return;
    const pairId = state.pair.id;
    channel = client
      .channel(`livingo-${pairId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "words", filter: `pair_id=eq.${pairId}` }, emit)
      .on("postgres_changes", { event: "*", schema: "public", table: "streaks", filter: `pair_id=eq.${pairId}` }, emit)
      .on("postgres_changes", { event: "*", schema: "public", table: "attachments", filter: `pair_id=eq.${pairId}` }, emit)
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `pair_id=eq.${pairId}` }, emit)
      .on("postgres_changes", { event: "*", schema: "public", table: "srs_states", filter: `pair_id=eq.${pairId}` }, emit)
      .subscribe();
  }

  async function refresh(): Promise<SessionState | null> {
    state = await fetchState();
    ensureChannel();
    return state;
  }

  async function requireState(): Promise<SessionState> {
    const next = state ?? (await refresh());
    if (!next) throw new Error("Join a pair first.");
    return next;
  }

  return {
    mode: "supabase",
    load: refresh,
    reload: refresh,
    subscribe(listener) {
      listeners.add(listener);
      ensureChannel();
      const poll = window.setInterval(() => {
        if (state) listener();
      }, 8000);
      return () => {
        listeners.delete(listener);
        window.clearInterval(poll);
      };
    },
    async createPair(input) {
      await userId();
      const { error } = await client.rpc("create_pair", {
        p_display_name: input.displayName,
        p_teaches: input.teaches,
        p_timezone: input.timezone,
      });
      fail(error, "Couldn't create the pair.");
      const next = await refresh();
      if (!next) throw new Error("The pair was created, but the read policy hid it. Check the Supabase SQL.");
      return next;
    },
    async joinPair(input) {
      await userId();
      const { error } = await client.rpc("join_pair", {
        p_code: input.code,
        p_display_name: input.displayName,
        p_teaches: input.teaches,
        p_timezone: input.timezone,
      });
      fail(error, "Couldn't join that pair.");
      const next = await refresh();
      if (!next) throw new Error("Joined, but the pair couldn't be read. Check the Supabase SQL.");
      return next;
    },
    async createStreak(input) {
      const current = await requireState();
      if (current.members.length < 2) throw new Error("Wait for your friend to join, then you can start together.");
      const { error } = await client.from("streaks").insert({
        id: createId(),
        pair_id: current.pair.id,
        name: input.name.trim(),
        daily_limit: clampLimit(input.dailyLimit),
        start_date: localDate(current.me.timezone, new Date()),
        created_by: current.me.id,
      });
      fail(error, "Couldn't start that streak.");
      return (await refresh())!;
    },
    async updateStreak(id, patch) {
      const changes: Record<string, unknown> = {};
      if (patch.name) changes.name = patch.name.trim();
      if (patch.dailyLimit !== undefined) changes.daily_limit = clampLimit(patch.dailyLimit);
      const { error } = await client.from("streaks").update(changes).eq("id", id);
      fail(error, "Couldn't update the streak.");
      return (await refresh())!;
    },
    async deleteStreak(id) {
      const current = await requireState();
      const wordIds = new Set(current.words.filter((word) => word.streakId === id).map((word) => word.id));
      const paths = current.attachments
        .filter((item) => wordIds.has(item.wordId))
        .map((item) => `${current.pair.id}/${item.mediaId}`);
      if (paths.length) await client.storage.from("livingo-media").remove(paths);
      const { error } = await client.from("streaks").delete().eq("id", id);
      fail(error, "Couldn't delete the streak.");
      return (await refresh())!;
    },
    async addWord(input) {
      const current = await requireState();
      if (current.members.length < 2) throw new Error("Wait for your friend to join, then you can start together.");
      const now = new Date().toISOString();
      const { error } = await client.from("words").insert({
        id: createId(),
        streak_id: input.streakId,
        pair_id: current.pair.id,
        author_id: current.me.id,
        language: current.me.teaches,
        text: input.text.trim(),
        meaning: input.meaning.trim(),
        explanation: "",
        local_date: localDate(current.me.timezone, new Date()),
        created_at: now,
        updated_at: now,
      });
      fail(error, "Couldn't save that word.");
      return (await refresh())!;
    },
    async updateWord(id, patch) {
      const current = await requireState();
      const word = current.words.find((item) => item.id === id);
      if (!word) throw new Error("That card is gone.");
      const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.text !== undefined) changes.text = patch.text.trim();
      if (patch.meaning !== undefined) changes.meaning = patch.meaning.trim();
      if (patch.explanation !== undefined) {
        changes.explanation = patch.explanation.trim();
        changes.explanation_author_id = patch.explanation.trim() ? current.me.id : null;
      }
      const { error } = await client.from("words").update(changes).eq("id", id);
      fail(error, "Couldn't update that card.");
      return (await refresh())!;
    },
    async deleteWord(id) {
      const current = await requireState();
      const paths = current.attachments.filter((item) => item.wordId === id).map((item) => `${current.pair.id}/${item.mediaId}`);
      if (paths.length) await client.storage.from("livingo-media").remove(paths);
      const { error } = await client.from("words").delete().eq("id", id);
      fail(error, "Couldn't delete that card.");
      return (await refresh())!;
    },
    async addAttachment(input: AttachmentInput) {
      const current = await requireState();
      const mediaId = createId();
      const path = `${current.pair.id}/${mediaId}`;
      const uploaded = await client.storage.from("livingo-media").upload(path, input.blob, { contentType: input.mimeType });
      fail(uploaded.error, "Couldn't upload that file.");
      const { error } = await client.from("attachments").insert({
        id: createId(),
        word_id: input.wordId,
        pair_id: current.pair.id,
        author_id: current.me.id,
        kind: input.kind,
        media_id: mediaId,
        mime_type: input.mimeType,
        duration_ms: input.durationMs ?? null,
      });
      if (error) {
        await client.storage.from("livingo-media").remove([path]);
        throw new Error(error.message);
      }
      return (await refresh())!;
    },
    async deleteAttachment(id) {
      const current = await requireState();
      const attachment = current.attachments.find((item) => item.id === id);
      if (!attachment) throw new Error("That attachment is already gone.");
      await client.storage.from("livingo-media").remove([`${current.pair.id}/${attachment.mediaId}`]);
      const { error } = await client.from("attachments").delete().eq("id", id);
      fail(error, "Couldn't delete that attachment.");
      return (await refresh())!;
    },
    async getMedia(mediaId) {
      const current = await requireState();
      const downloaded = await client.storage.from("livingo-media").download(`${current.pair.id}/${mediaId}`);
      if (downloaded.error || !downloaded.data) throw new Error("That file is missing.");
      return downloaded.data;
    },
    async review(wordId, grade: ReviewGrade) {
      const current = await requireState();
      const today = localDate(current.me.timezone, new Date());
      const existing = current.srs.find((card) => card.wordId === wordId);
      const next = reviewCard(existing, wordId, current.me.id, grade, today);
      const { error } = await client.from("srs_states").upsert({
        id: next.id,
        word_id: next.wordId,
        member_id: next.userId,
        pair_id: current.pair.id,
        ease: next.ease,
        interval_days: next.interval,
        due: next.due,
        reps: next.reps,
        lapses: next.lapses,
        last_reviewed: next.lastReviewed,
      });
      fail(error, "Couldn't save that review.");
      return (await refresh())!;
    },
    async updateMe(patch) {
      const current = await requireState();
      const changes: Record<string, unknown> = {};
      if (patch.displayName) changes.display_name = patch.displayName.trim();
      if (patch.timezone) changes.timezone = patch.timezone;
      if (patch.reminderHour !== undefined) changes.reminder_hour = patch.reminderHour;
      if (patch.reminderMinute !== undefined) changes.reminder_minute = patch.reminderMinute;
      const { error } = await client.from("members").update(changes).eq("id", current.me.id);
      fail(error, "Couldn't update your profile.");
      return (await refresh())!;
    },
    async savePush(subscription: PushSubscriptionJSON) {
      const current = await requireState();
      const { error } = await client.from("push_subscriptions").upsert(
        {
          id: createId(),
          member_id: current.me.id,
          pair_id: current.pair.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        { onConflict: "endpoint" },
      );
      fail(error, "Couldn't store this device for push.");
    },
    async signOut() {
      if (channel) await client.removeChannel(channel);
      channel = null;
      state = null;
      await client.auth.signOut();
    },
  };
}

function mapStreak(row: Record<string, unknown>): Streak {
  return {
    id: String(row.id),
    pairId: String(row.pair_id),
    name: String(row.name),
    dailyLimit: Number(row.daily_limit),
    startDate: String(row.start_date).slice(0, 10),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

function mapWord(row: Record<string, unknown>): Word {
  return {
    id: String(row.id),
    streakId: String(row.streak_id),
    pairId: String(row.pair_id),
    authorId: String(row.author_id),
    language: row.language === "fr" ? "fr" : "sv",
    text: String(row.text),
    meaning: String(row.meaning),
    explanation: String(row.explanation ?? ""),
    explanationAuthorId: row.explanation_author_id ? String(row.explanation_author_id) : null,
    localDate: String(row.local_date).slice(0, 10),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: String(row.id),
    wordId: String(row.word_id),
    pairId: String(row.pair_id),
    authorId: String(row.author_id),
    kind: row.kind === "voice" ? "voice" : "image",
    mediaId: String(row.media_id),
    mimeType: String(row.mime_type),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    createdAt: String(row.created_at),
  };
}

function mapSrs(row: Record<string, unknown>): SrsCard {
  return {
    id: String(row.id),
    wordId: String(row.word_id),
    userId: String(row.member_id),
    ease: Number(row.ease),
    interval: Number(row.interval_days),
    due: String(row.due).slice(0, 10),
    reps: Number(row.reps),
    lapses: Number(row.lapses),
    lastReviewed: row.last_reviewed ? String(row.last_reviewed).slice(0, 10) : null,
  };
}

export async function pingSupabase(url: string, anonKey: string): Promise<void> {
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: anonKey } });
  if (!response.ok) throw new Error("Supabase didn't answer. Check the project URL and anon key.");
}
