/*
 * Date & time helpers.
 * Dates are stored as local "YYYY-MM-DD" keys and times as "HH:MM" strings,
 * which keeps grouping by day trivial and avoids timezone drift.
 */

export const MINUTES_PER_DAY = 24 * 60;

export const pad2 = (n) => String(n).padStart(2, "0");

export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toDateKey(new Date());

export function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  return toDateKey(parseDateKey(value)) === value;
}

export function addDays(key, days) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function addMonths(key, months) {
  const d = parseDateKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toDateKey(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a, b) {
  const ms = parseDateKey(b) - parseDateKey(a);
  return Math.round(ms / 86400000);
}

export const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

/** Weeks start on Monday. */
export function startOfWeek(key) {
  const d = parseDateKey(key);
  const offset = (d.getDay() + 6) % 7;
  return addDays(key, -offset);
}

export const endOfWeek = (key) => addDays(startOfWeek(key), 6);

export const startOfMonth = (key) => `${key.slice(0, 7)}-01`;

export function endOfMonth(key) {
  const d = parseDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export const startOfYear = (key) => `${key.slice(0, 4)}-01-01`;
export const endOfYear = (key) => `${key.slice(0, 4)}-12-31`;

/** Monday = 0 … Sunday = 6 */
export const weekdayIndex = (key) => (parseDateKey(key).getDay() + 6) % 7;

export function rangeKeys(from, to) {
  const keys = [];
  for (let k = from; k <= to; k = addDays(k, 1)) keys.push(k);
  return keys;
}

export const isTimeString = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");

export function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(total) {
  const t = ((Math.round(total) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

export function toTimeString(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

/** Minutes between two "HH:MM" strings on the same day (end may wrap past midnight). */
export function spanMinutes(start, end) {
  let diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff < 0) diff += MINUTES_PER_DAY;
  return diff;
}

/** Rounds "now" to the next quarter hour, used as a sensible default start. */
export function nextQuarterHour(date = new Date()) {
  const mins = nowMinutes(date);
  return Math.min(Math.ceil(mins / 15) * 15, MINUTES_PER_DAY - 15);
}

/* ---------- Formatting ---------- */

export function formatDuration(minutes, { empty = "0m" } = {}) {
  const total = Math.max(0, Math.round(minutes || 0));
  if (total === 0) return empty;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0 || h >= 100) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Compact hours for large aggregates: "182h", "18.5h". */
export function formatHours(minutes) {
  const hours = (minutes || 0) / 60;
  if (hours >= 100 || Number.isInteger(hours)) return `${Math.round(hours)}h`;
  return `${hours.toFixed(1).replace(/\.0$/, "")}h`;
}

export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

const fmt = {
  day: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }),
  dayYear: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  weekdayDay: new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }),
  long: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }),
  longYear: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  month: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }),
  monthShort: new Intl.DateTimeFormat("en-GB", { month: "short" }),
  weekdayShort: new Intl.DateTimeFormat("en-GB", { weekday: "short" }),
  weekdayLong: new Intl.DateTimeFormat("en-GB", { weekday: "long" }),
};

/** style: day | dayYear | weekdayDay | long | longYear | month | monthShort | weekdayShort | weekdayLong */
export function formatDate(key, style = "day") {
  return fmt[style].format(parseDateKey(key));
}

export function relativeDayLabel(key, today = todayKey()) {
  const diff = diffDays(today, key);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return sameYear ? formatDate(key, "weekdayDay") : formatDate(key, "dayYear");
}

export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function formatHourRange(startHour, endHour) {
  return `${pad2(startHour % 24)}:00 – ${pad2(endHour % 24)}:00`;
}
