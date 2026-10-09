import { EFFORT_MAX, EFFORT_MIN, isCategory, type Category } from "./types";

export interface ParsedTask {
  title: string;
  dueAt: number | null;
  category: Category;
  effort: number;
  dueLabel: string | null;
}

interface Span {
  start: number;
  end: number;
}

interface DateHit {
  dueAt: number;
  label: string;
  spans: Span[];
}

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const TIME_RE =
  /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/gi;
const WEEKDAY_RE =
  /\b(?:next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|thur|fri(?:day)?|sat(?:urday)?)\b/gi;
const RELATIVE_RE = /\b(?:in\s+)?(\d+)\s+(days?|hours?|hrs?|weeks?)\b/gi;
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{2}):(\d{2}))?\b/gi;
const MONTH_DAY_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
const DAY_MONTH_RE =
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;
const KEYWORD_RE = /\b(today|tomorrow|tonight|tmrw|tmr|this\s+weekend)\b/gi;

export function parseTaskInput(input: string, now: Date = new Date()): ParsedTask {
  let rest = input.trim();
  let category: Category = "personal";
  let effort = 3;

  rest = rest.replace(/(^|\s)#([a-zA-Z][\w-]*)\b/g, (full, pre: string, tag: string) => {
    const lower = tag.toLowerCase();
    if (isCategory(lower)) {
      category = lower;
      return pre;
    }
    return full;
  });

  rest = rest.replace(/(^|\s)!([1-5])\b/g, (_full, pre: string, n: string) => {
    effort = Number(n);
    return pre;
  });

  const dated = extractDate(rest, now);
  const title = dated.rest.replace(/\s+/g, " ").trim();

  return {
    title,
    dueAt: dated.dueAt,
    category,
    effort: clampEffort(effort),
    dueLabel: dated.label,
  };
}

export function formatDue(dueAt: number | null, now: Date = new Date()): string {
  if (dueAt === null) return "No due date";
  const due = new Date(dueAt);
  const delta = due.getTime() - now.getTime();
  const dayMs = 86_400_000;
  const sameDay = isSameDay(due, now);

  if (delta < 0) {
    const days = Math.ceil(-delta / dayMs);
    if (sameDay) return `Overdue · ${formatTime(due)}`;
    if (days === 1) return "Overdue · yesterday";
    return `Overdue · ${days} days`;
  }
  if (sameDay) return `Today ${formatTime(due)}`;
  const tomorrow = addDays(startOfDay(now), 1);
  if (isSameDay(due, tomorrow)) return `Tomorrow ${formatTime(due)}`;
  return `${weekdayName(due.getDay())} ${formatTime(due)} · ${due.getMonth() + 1}/${due.getDate()}`;
}

export function extractDate(
  input: string,
  now: Date,
): { rest: string; dueAt: number | null; label: string | null } {
  const hit = findDateHit(input, now);
  if (!hit) {
    return { rest: input, dueAt: null, label: null };
  }
  const rest = cutSpans(input, hit.spans);
  return { rest, dueAt: hit.dueAt, label: hit.label };
}

function findDateHit(input: string, now: Date): DateHit | null {
  const time = findTime(input);
  const iso = matchIso(input, now);
  if (iso) return iso;

  const relative = matchRelative(input, now);
  if (relative) return relative;

  const keyword = matchKeyword(input, now, time);
  if (keyword) return keyword;

  const weekday = matchWeekday(input, now, time);
  if (weekday) return weekday;

  const monthDay = matchMonthDay(input, now, time);
  if (monthDay) return monthDay;

  if (time) {
    const due = applyTime(new Date(now), time.hours, time.minutes);
    if (due.getTime() <= now.getTime()) {
      due.setDate(due.getDate() + 1);
    }
    return {
      dueAt: due.getTime(),
      label: formatDue(due.getTime(), now),
      spans: [time.span],
    };
  }

  return null;
}

function matchIso(input: string, now: Date): DateHit | null {
  const re = cloneRe(ISO_RE);
  const match = re.exec(input);
  if (!match || match.index === undefined) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hours = match[4] !== undefined ? Number(match[4]) : 9;
  const minutes = match[5] !== undefined ? Number(match[5]) : 0;
  const due = new Date(year, month, day, hours, minutes, 0, 0);
  return {
    dueAt: due.getTime(),
    label: formatDue(due.getTime(), now),
    spans: [{ start: match.index, end: match.index + match[0].length }],
  };
}

function matchRelative(input: string, now: Date): DateHit | null {
  const re = cloneRe(RELATIVE_RE);
  const match = re.exec(input);
  if (!match || match.index === undefined) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const due = new Date(now);
  if (unit.startsWith("hour") || unit.startsWith("hr")) {
    due.setHours(due.getHours() + amount);
  } else if (unit.startsWith("week")) {
    due.setDate(due.getDate() + amount * 7);
    due.setHours(9, 0, 0, 0);
  } else {
    due.setDate(due.getDate() + amount);
    due.setHours(9, 0, 0, 0);
  }
  return {
    dueAt: due.getTime(),
    label: formatDue(due.getTime(), now),
    spans: [{ start: match.index, end: match.index + match[0].length }],
  };
}

function matchKeyword(input: string, now: Date, time: TimeHit | null): DateHit | null {
  const re = cloneRe(KEYWORD_RE);
  const match = re.exec(input);
  if (!match || match.index === undefined) return null;
  const word = match[1].toLowerCase().replace(/\s+/g, " ");
  const spans: Span[] = [{ start: match.index, end: match.index + match[0].length }];
  const due = new Date(now);
  let hours = 9;
  let minutes = 0;

  if (word === "tonight") {
    hours = 20;
    minutes = 0;
  } else if (word === "tomorrow" || word === "tmrw" || word === "tmr") {
    due.setDate(due.getDate() + 1);
  } else if (word === "this weekend") {
    const day = due.getDay();
    const add = day === 6 ? 0 : day === 0 ? 0 : 6 - day;
    due.setDate(due.getDate() + add);
    hours = 10;
  }

  if (time) {
    hours = time.hours;
    minutes = time.minutes;
    spans.push(time.span);
  }

  applyTime(due, hours, minutes);
  if (word === "tonight" && due.getTime() <= now.getTime()) {
    due.setDate(due.getDate() + 1);
  }

  return {
    dueAt: due.getTime(),
    label: formatDue(due.getTime(), now),
    spans,
  };
}

function matchWeekday(input: string, now: Date, time: TimeHit | null): DateHit | null {
  const re = cloneRe(WEEKDAY_RE);
  const match = re.exec(input);
  if (!match || match.index === undefined) return null;
  const forceNext = /^next\s+/i.test(match[0]);
  const key = match[1].toLowerCase();
  const target = WEEKDAY_INDEX[key];
  if (target === undefined) return null;

  const spans: Span[] = [{ start: match.index, end: match.index + match[0].length }];
  const due = new Date(now);
  const current = due.getDay();
  let delta = (target - current + 7) % 7;
  const hours = time ? time.hours : 9;
  const minutes = time ? time.minutes : 0;

  if (delta === 0) {
    const candidate = applyTime(new Date(now), hours, minutes);
    if (forceNext || candidate.getTime() <= now.getTime()) {
      delta = 7;
    }
  }

  due.setDate(due.getDate() + delta);
  applyTime(due, hours, minutes);
  if (time) spans.push(time.span);

  return {
    dueAt: due.getTime(),
    label: formatDue(due.getTime(), now),
    spans,
  };
}

function matchMonthDay(input: string, now: Date, time: TimeHit | null): DateHit | null {
  const first = monthDayMatch(input, true) ?? monthDayMatch(input, false);
  if (!first) return null;
  const spans: Span[] = [first.span];
  const hours = time ? time.hours : 9;
  const minutes = time ? time.minutes : 0;
  if (time) spans.push(time.span);

  let due = new Date(now.getFullYear(), first.month, first.day, hours, minutes, 0, 0);
  if (due.getTime() + 60_000 < now.getTime()) {
    due = new Date(now.getFullYear() + 1, first.month, first.day, hours, minutes, 0, 0);
  }

  return {
    dueAt: due.getTime(),
    label: formatDue(due.getTime(), now),
    spans,
  };
}

function monthDayMatch(
  input: string,
  monthFirst: boolean,
): { month: number; day: number; span: Span } | null {
  const re = cloneRe(monthFirst ? MONTH_DAY_RE : DAY_MONTH_RE);
  const match = re.exec(input);
  if (!match || match.index === undefined) return null;
  const monthToken = (monthFirst ? match[1] : match[2]).toLowerCase();
  const day = Number(monthFirst ? match[2] : match[1]);
  const month = MONTH_INDEX[monthToken];
  if (month === undefined || day < 1 || day > 31) return null;
  return {
    month,
    day,
    span: { start: match.index, end: match.index + match[0].length },
  };
}

interface TimeHit {
  hours: number;
  minutes: number;
  span: Span;
}

function findTime(input: string): TimeHit | null {
  const re = cloneRe(TIME_RE);
  let best: TimeHit | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) {
    const hoursRaw = Number(match[1]);
    const minutes = match[2] !== undefined ? Number(match[2]) : 0;
    const mer = match[3]?.toLowerCase().replace(/\./g, "") ?? "";
    if (minutes > 59) continue;

    let hours = hoursRaw;
    if (mer.startsWith("p")) {
      if (hoursRaw > 12) continue;
      hours = hoursRaw === 12 ? 12 : hoursRaw + 12;
    } else if (mer.startsWith("a")) {
      if (hoursRaw > 12) continue;
      hours = hoursRaw === 12 ? 0 : hoursRaw;
    } else if (!match[2] && hoursRaw <= 24) {
      // Bare numbers like "5" are titles, not times. Require am/pm or :mm.
      continue;
    } else if (hoursRaw > 23) {
      continue;
    }

    if (hours === 24) hours = 0;
    best = {
      hours,
      minutes,
      span: { start: match.index, end: match.index + match[0].length },
    };
  }
  return best;
}

function applyTime(date: Date, hours: number, minutes: number): Date {
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function cutSpans(input: string, spans: Span[]): string {
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let next = input;
  for (const span of ordered) {
    next = `${next.slice(0, span.start)}${next.slice(span.end)}`;
  }
  return next;
}

function cloneRe(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const mer = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  if (minutes === 0) return `${h12} ${mer}`;
  return `${h12}:${String(minutes).padStart(2, "0")} ${mer}`;
}

function weekdayName(day: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? "Day";
}

function clampEffort(value: number): number {
  return Math.min(EFFORT_MAX, Math.max(EFFORT_MIN, Math.round(value)));
}
