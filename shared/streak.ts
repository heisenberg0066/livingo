import { addDays, daysBetween, eachDate, isoWeekKey, localDate, weekdayShort } from "./time.ts";
import type { Language } from "./types.ts";

export type DayStatus = "complete" | "frozen" | "failed" | "pending" | "future" | "before";
export type TurnKind = "post" | "reply" | "waiting-post" | "waiting-reply" | "complete";

export interface DayCell {
  date: string;
  weekday: string;
  status: DayStatus;
  mine: number;
  partner: number;
}

export interface TurnMember {
  id: string;
  timezone: string;
  teaches: Language;
  displayName: string;
}

export interface TurnWord {
  id: string;
  authorId: string;
  localDate: string;
  replyText: string;
}

export interface TurnView {
  kind: TurnKind;
  date: string;
  headline: string;
  detail: string;
  posted: number;
  replied: number;
  limit: number;
  replyWordIds: string[];
  actionLanguage: Language;
}

export interface StreakSnapshot {
  count: number;
  today: string;
  partnerToday: string;
  limit: number;
  todayStatus: DayStatus;
  todayComplete: boolean;
  turn: TurnView;
  freeze: {
    weekKey: string;
    used: boolean;
    usedOn: string | null;
    available: boolean;
  };
  days: DayCell[];
  brokenOn: string | null;
  completedDates: string[];
  frozenDates: string[];
}

const LANGUAGE_NAME: Record<Language, string> = { sv: "Swedish", fr: "French" };

export function rolesForDate(startDate: string, date: string, starterId: string, otherId: string) {
  if (date < startDate) return null;
  const posterId = daysBetween(startDate, date) % 2 === 0 ? starterId : otherId;
  const replierId = posterId === starterId ? otherId : starterId;
  return { posterId, replierId };
}

function postsOn(words: TurnWord[], date: string) {
  return words.filter((word) => word.localDate === date);
}

function replyWindowOpen(replierToday: string, date: string) {
  return replierToday <= addDays(date, 1);
}

/**
 * Days alternate. The starter posts on startDate, then the other person, and so on.
 * A day is that poster's calendar date. They must post today's words before their
 * midnight. The replier can answer until the end of their own next calendar day
 * (the post date, or the day after it). The day counts only when every posted
 * word has a reply. The first miss in an ISO week is a freeze.
 */
export function dayStatus(input: {
  startDate: string;
  date: string;
  starterId: string;
  otherId: string;
  dailyLimit: number;
  members: TurnMember[];
  words: TurnWord[];
  now: Date;
}): DayStatus {
  if (input.date < input.startDate) return "before";
  if (input.members.length < 2) return "pending";
  const roles = rolesForDate(input.startDate, input.date, input.starterId, input.otherId);
  if (!roles) return "before";
  const poster = input.members.find((member) => member.id === roles.posterId);
  const replier = input.members.find((member) => member.id === roles.replierId);
  if (!poster || !replier) return "pending";
  const posterToday = localDate(poster.timezone, input.now);
  const replierToday = localDate(replier.timezone, input.now);
  if (posterToday < input.date && replierToday < input.date) return "future";
  const posts = postsOn(input.words, input.date);
  const posted = posts.length;
  const replied = posts.filter((word) => word.replyText.trim()).length;
  const limit = Math.max(1, input.dailyLimit);
  if (posted >= limit && replied >= posted) return "complete";
  const postingClosed = posterToday > input.date;
  const repliesClosed = !replyWindowOpen(replierToday, input.date);
  if (postingClosed && posted < limit) return "failed";
  if (repliesClosed && (posted < limit || replied < posted)) return "failed";
  return "pending";
}

export function describeTurn(input: {
  startDate: string;
  starterId: string;
  dailyLimit: number;
  members: TurnMember[];
  viewerId: string;
  words: TurnWord[];
  now: Date;
}): TurnView {
  const limit = Math.max(1, input.dailyLimit);
  const viewer = input.members.find((member) => member.id === input.viewerId) ?? input.members[0];
  const partner = input.members.find((member) => member.id !== viewer?.id);
  const empty: TurnView = {
    kind: "waiting-post",
    date: viewer ? localDate(viewer.timezone, input.now) : localDate("UTC", input.now),
    headline: "Waiting for your friend",
    detail: "A streak alternates once you are both here.",
    posted: 0,
    replied: 0,
    limit,
    replyWordIds: [],
    actionLanguage: viewer?.teaches ?? "sv",
  };
  if (!viewer || !partner) return empty;
  const viewerToday = localDate(viewer.timezone, input.now);
  const partnerToday = localDate(partner.timezone, input.now);
  const otherId = input.members.find((member) => member.id !== input.starterId)?.id ?? partner.id;
  const latest = viewerToday > partnerToday ? viewerToday : partnerToday;
  const openReplies: string[] = [];
  let replyDate = "";
  for (const date of eachDate(input.startDate, latest)) {
    const roles = rolesForDate(input.startDate, date, input.starterId, otherId);
    if (!roles || roles.replierId !== viewer.id) continue;
    if (!replyWindowOpen(viewerToday, date)) continue;
    const waiting = postsOn(input.words, date).filter((word) => !(word.replyText ?? "").trim());
    if (waiting.length === 0) continue;
    if (!replyDate) replyDate = date;
    openReplies.push(...waiting.map((word) => word.id));
  }
  if (openReplies.length > 0) {
    return {
      kind: "reply",
      date: replyDate,
      headline: `Reply to ${partner.displayName}'s word in ${LANGUAGE_NAME[viewer.teaches]}`,
      detail: `Answer in your language. You can reply through the end of ${replyDate === viewerToday ? "today" : "tomorrow"} where you are.`,
      posted: postsOn(input.words, replyDate).length,
      replied: postsOn(input.words, replyDate).filter((word) => word.replyText.trim()).length,
      limit,
      replyWordIds: openReplies,
      actionLanguage: viewer.teaches,
    };
  }

  const mine = rolesForDate(input.startDate, viewerToday, input.starterId, otherId);
  if (mine?.posterId === viewer.id) {
    const posts = postsOn(input.words, viewerToday);
    const replied = posts.filter((word) => word.replyText.trim()).length;
    if (posts.length < limit) {
      return {
        kind: "post",
        date: viewerToday,
        headline: `Your turn to post a ${LANGUAGE_NAME[viewer.teaches]} word`,
        detail: `Post ${limit === 1 ? "one word" : `${limit} words`} with the English meaning. ${partner.displayName} replies in ${LANGUAGE_NAME[partner.teaches]}.`,
        posted: posts.length,
        replied,
        limit,
        replyWordIds: [],
        actionLanguage: viewer.teaches,
      };
    }
    if (replied < posts.length) {
      return {
        kind: "waiting-reply",
        date: viewerToday,
        headline: `Waiting for ${partner.displayName} to reply in ${LANGUAGE_NAME[partner.teaches]}`,
        detail: "The day counts when every word you posted has a translation.",
        posted: posts.length,
        replied,
        limit,
        replyWordIds: [],
        actionLanguage: partner.teaches,
      };
    }
    return completeTurn(viewerToday, posts.length, replied, limit, viewer.teaches);
  }

  const theirs = rolesForDate(input.startDate, partnerToday, input.starterId, otherId);
  if (theirs?.posterId === partner.id) {
    const posts = postsOn(input.words, partnerToday);
    const replied = posts.filter((word) => (word.replyText ?? "").trim()).length;
    if (posts.length < limit) {
      return {
        kind: "waiting-post",
        date: partnerToday,
        headline: `Waiting for ${partner.displayName}'s ${LANGUAGE_NAME[partner.teaches]} word`,
        detail: "They post today. You answer each word in your language.",
        posted: posts.length,
        replied,
        limit,
        replyWordIds: [],
        actionLanguage: partner.teaches,
      };
    }
    if (replied >= posts.length) return completeTurn(partnerToday, posts.length, replied, limit, viewer.teaches);
  }

  return {
    kind: "waiting-post",
    date: viewerToday,
    headline: `Waiting for ${partner.displayName}'s ${LANGUAGE_NAME[partner.teaches]} word`,
    detail: "The next post starts on their calendar day.",
    posted: 0,
    replied: 0,
    limit,
    replyWordIds: [],
    actionLanguage: partner.teaches,
  };
}

function completeTurn(date: string, posted: number, replied: number, limit: number, language: Language): TurnView {
  return {
    kind: "complete",
    date,
    headline: "Day complete 🔥",
    detail: "Both sides of the card are in. The flame keeps going.",
    posted,
    replied,
    limit,
    replyWordIds: [],
    actionLanguage: language,
  };
}

export function actionPending(turn: TurnView | null | undefined): boolean {
  return turn?.kind === "post" || turn?.kind === "reply";
}

export function assertCanPost(input: {
  startDate: string;
  starterId: string;
  dailyLimit: number;
  viewerId: string;
  otherId: string;
  viewerTimezone: string;
  wordsOnDay: number;
  now: Date;
}): string {
  const today = localDate(input.viewerTimezone, input.now);
  const roles = rolesForDate(input.startDate, today, input.starterId, input.otherId);
  if (!roles || roles.posterId !== input.viewerId) throw new Error("It is not your turn to post.");
  if (input.wordsOnDay >= Math.max(1, input.dailyLimit)) throw new Error("Today's words are already posted.");
  return today;
}

export function assertCanReply(input: {
  startDate: string;
  starterId: string;
  otherId: string;
  viewerId: string;
  viewerTimezone: string;
  localDate: string;
  replyText: string;
  now: Date;
}): void {
  if (input.replyText.trim()) throw new Error("This word already has a reply. Edit the card to change it.");
  const roles = rolesForDate(input.startDate, input.localDate, input.starterId, input.otherId);
  if (!roles || roles.replierId !== input.viewerId) throw new Error("Only the other person can reply.");
  const today = localDate(input.viewerTimezone, input.now);
  if (!replyWindowOpen(today, input.localDate)) throw new Error("The reply window for that day has closed.");
}

export function computeStreak(input: {
  startDate: string;
  starterId: string;
  dailyLimit: number;
  members: TurnMember[];
  viewerId: string;
  words: TurnWord[];
  now: Date;
}): StreakSnapshot {
  const limit = Math.max(1, input.dailyLimit);
  const viewer = input.members.find((member) => member.id === input.viewerId) ?? input.members[0];
  const partner = input.members.find((member) => member.id !== viewer?.id);
  const today = viewer ? localDate(viewer.timezone, input.now) : localDate("UTC", input.now);
  const partnerToday = partner ? localDate(partner.timezone, input.now) : today;
  const starterId = input.starterId || input.members[0]?.id || "";
  const otherId = input.members.find((member) => member.id !== starterId)?.id ?? partner?.id ?? "";
  const latest = today > partnerToday ? today : partnerToday;

  const rawStatus = (date: string): DayStatus =>
    dayStatus({
      startDate: input.startDate,
      date,
      starterId,
      otherId,
      dailyLimit: limit,
      members: input.members,
      words: input.words,
      now: input.now,
    });

  const span = partner && starterId ? eachDate(input.startDate, latest) : [];
  const frozen = new Set<string>();
  const failed = new Set<string>();
  const usedWeeks = new Set<string>();
  for (const date of span) {
    if (rawStatus(date) !== "failed") continue;
    const week = isoWeekKey(date);
    if (usedWeeks.has(week)) failed.add(date);
    else {
      usedWeeks.add(week);
      frozen.add(date);
    }
  }
  const statusOf = (date: string): DayStatus => {
    if (frozen.has(date)) return "frozen";
    if (failed.has(date)) return "failed";
    return rawStatus(date);
  };

  let cursor = latest;
  let guard = 0;
  while (cursor >= input.startDate && guard < 4000) {
    const status = statusOf(cursor);
    if (status === "future" || status === "pending" || status === "before") {
      cursor = addDays(cursor, -1);
      guard += 1;
      continue;
    }
    break;
  }
  let count = 0;
  let brokenOn: string | null = null;
  guard = 0;
  while (cursor >= input.startDate && guard < 4000) {
    const status = statusOf(cursor);
    if (status === "complete" || status === "frozen") {
      count += 1;
      cursor = addDays(cursor, -1);
      guard += 1;
      continue;
    }
    if (status === "failed") brokenOn = cursor;
    break;
  }

  const weekKey = isoWeekKey(today);
  const frozenThisWeek = [...frozen].filter((date) => isoWeekKey(date) === weekKey).sort();
  const turn = describeTurn({
    startDate: input.startDate,
    starterId,
    dailyLimit: limit,
    members: input.members,
    viewerId: input.viewerId,
    words: input.words,
    now: input.now,
  });
  const days: DayCell[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    const dayPosts = postsOn(input.words, date);
    days.push({
      date,
      weekday: weekdayShort(date),
      status: statusOf(date),
      mine: dayPosts.filter((word) => word.authorId === viewer?.id).length,
      partner: dayPosts.filter((word) => word.authorId === partner?.id).length,
    });
  }

  return {
    count,
    today,
    partnerToday,
    limit,
    todayStatus: statusOf(turn.date),
    todayComplete: turn.kind === "complete",
    turn,
    freeze: {
      weekKey,
      used: frozenThisWeek.length > 0,
      usedOn: frozenThisWeek[0] ?? null,
      available: frozenThisWeek.length === 0,
    },
    days,
    brokenOn,
    completedDates: span.filter((date) => rawStatus(date) === "complete"),
    frozenDates: [...frozen].sort(),
  };
}
