import { addDays, eachDate, isoWeekKey, localDate, weekdayShort } from "./time.ts";

export type DayStatus = "complete" | "frozen" | "failed" | "pending" | "future" | "before";

export interface DayCell {
  date: string;
  weekday: string;
  status: DayStatus;
  mine: number;
  partner: number;
}

export interface StreakSnapshot {
  count: number;
  today: string;
  partnerToday: string;
  myCount: number;
  partnerCount: number;
  limit: number;
  todayStatus: DayStatus;
  todayComplete: boolean;
  myGoalMet: boolean;
  partnerGoalMet: boolean;
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

export interface StreakMember {
  id: string;
  timezone: string;
}

export interface StreakWord {
  authorId: string;
  localDate: string;
}

/**
 * A shared day is one calendar date. Each person can only fill the date it
 * currently is in their own time zone (no backfilling after their midnight).
 * The day is complete when every member has at least `dailyLimit` words stamped
 * with that date. A day that can no longer be completed is a miss. The first
 * miss in an ISO week is saved by the weekly freeze; a second miss breaks the
 * streak. Days that are still open do not count yet and do not break anything.
 */
export function computeStreak(input: {
  startDate: string;
  dailyLimit: number;
  members: StreakMember[];
  viewerId: string;
  words: StreakWord[];
  now: Date;
}): StreakSnapshot {
  const limit = Math.max(1, input.dailyLimit);
  const members = input.members;
  const viewer = members.find((member) => member.id === input.viewerId) ?? members[0];
  const partner = members.find((member) => member.id !== viewer?.id) ?? null;
  const today = viewer ? localDate(viewer.timezone, input.now) : localDate("UTC", input.now);
  const partnerToday = partner ? localDate(partner.timezone, input.now) : today;

  const countFor = (memberId: string, date: string) =>
    input.words.filter((word) => word.authorId === memberId && word.localDate === date).length;

  const memberToday = (member: StreakMember) => localDate(member.timezone, input.now);

  const rawStatus = (date: string): DayStatus => {
    if (date < input.startDate) return "before";
    if (members.length === 0) return "pending";
    if (members.every((member) => memberToday(member) < date)) return "future";
    if (members.length < 2) return "pending";
    const filled = members.map((member) => countFor(member.id, date) >= limit);
    if (filled.every(Boolean)) return "complete";
    const missedForever = members.some(
      (member) => countFor(member.id, date) < limit && memberToday(member) > date,
    );
    return missedForever ? "failed" : "pending";
  };

  const latest = today > partnerToday ? today : partnerToday;
  const span = eachDate(input.startDate, latest);
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
  const myCount = viewer ? countFor(viewer.id, today) : 0;
  const partnerCount = partner ? countFor(partner.id, today) : 0;
  const todayStatus = statusOf(today);

  const days: DayCell[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    days.push({
      date,
      weekday: weekdayShort(date),
      status: statusOf(date),
      mine: viewer ? countFor(viewer.id, date) : 0,
      partner: partner ? countFor(partner.id, date) : 0,
    });
  }

  return {
    count,
    today,
    partnerToday,
    myCount,
    partnerCount,
    limit,
    todayStatus,
    todayComplete: todayStatus === "complete",
    myGoalMet: myCount >= limit,
    partnerGoalMet: partner ? partnerCount >= limit : false,
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
