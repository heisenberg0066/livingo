export interface LocalParts {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
  date: string;
}

export function localParts(timeZone: string, now: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    hour,
    minute: Number(get("minute")),
    date: `${year}-${month}-${day}`,
  };
}

export function localDate(timeZone: string, now: Date): string {
  return localParts(timeZone, now).date;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const start = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const end = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((end - start) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string): string[] {
  if (to < from) return [];
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length < 4000) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function weekdayShort(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function formatLong(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1]}`;
}

/** ISO week of a calendar date, e.g. 2026-W47. The date is a calendar day, not an instant. */
export function isoWeekKey(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Convert a clock time on a calendar date in an IANA zone to a UTC instant.
 * Two correction passes cover the usual offset; DST gaps settle on the post-gap instant.
 */
export function zonedTimeToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let pass = 0; pass < 3; pass += 1) {
    const seen = localParts(timeZone, new Date(utc));
    const seenAsUtc = Date.UTC(
      Number(seen.year),
      Number(seen.month) - 1,
      Number(seen.day),
      seen.hour,
      seen.minute,
      0,
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = seenAsUtc - wanted;
    if (diff === 0) break;
    utc -= diff;
  }
  return new Date(utc);
}

export function nextReminderInstant(
  timeZone: string,
  hour: number,
  minute: number,
  now: Date,
  skipToday: boolean,
): Date {
  const today = localDate(timeZone, now);
  let when = zonedTimeToUtc(today, hour, minute, timeZone);
  if (skipToday || when.getTime() <= now.getTime() + 15_000) {
    when = zonedTimeToUtc(addDays(today, 1), hour, minute, timeZone);
  }
  return when;
}
