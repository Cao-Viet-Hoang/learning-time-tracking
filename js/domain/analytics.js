/*
 * Analytics derived purely from learning sessions (timer + manual alike).
 * Nothing here is stored — every number is recomputed from source records.
 */

import { state } from "../state.js";
import { minutesByDate, sessionsBetween, getSubject, firstActivityDate } from "./selectors.js";
import { findGoal } from "../services/goals.js";
import { todayKey, addDays, rangeKeys, weekdayIndex, timeToMinutes, diffDays } from "../utils/time.js";
import { sumBy, groupBy } from "../utils/misc.js";

/** Minimum data before we show behavioural patterns. */
export const PATTERN_MIN_SESSIONS = 5;
export const PATTERN_MIN_DAYS = 3;

/* ---------- Streaks ---------- */

export function streaks(today = todayKey()) {
  const byDate = minutesByDate();
  const days = [...byDate.keys()].filter((d) => byDate.get(d) > 0).sort();
  if (!days.length) return { current: 0, best: 0, activeToday: false, lastDay: null };

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = diffDays(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  // Current streak: counts back from today, or from yesterday if today has no learning yet.
  const activeToday = byDate.get(today) > 0;
  let cursor = activeToday ? today : addDays(today, -1);
  let current = 0;
  while (byDate.get(cursor) > 0) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, best: Math.max(best, current), activeToday, lastDay: days[days.length - 1] };
}

/* ---------- Distribution ---------- */

/** [{ subject, minutes, share, sessions }] sorted by minutes desc. */
export function subjectDistribution(from, to) {
  const sessions = sessionsBetween(from, to);
  const total = sumBy(sessions, (s) => s.durationMinutes);
  const rows = [...groupBy(sessions, (s) => s.subjectId).entries()].map(([subjectId, list]) => {
    const minutes = sumBy(list, (s) => s.durationMinutes);
    return { subject: getSubject(subjectId), minutes, sessions: list.length, share: total ? minutes / total : 0 };
  });
  rows.sort((a, b) => b.minutes - a.minutes);
  return { total, rows };
}

/** Lifetime minutes per subject id. */
export function totalsBySubject() {
  const map = new Map();
  for (const s of state.data.learningSessions) map.set(s.subjectId, (map.get(s.subjectId) || 0) + s.durationMinutes);
  return map;
}

export function subjectStats(subjectId, today = todayKey()) {
  const sessions = state.data.learningSessions.filter((s) => s.subjectId === subjectId);
  const total = sumBy(sessions, (s) => s.durationMinutes);
  const monthFrom = `${today.slice(0, 7)}-01`;
  const weekFrom = addDays(today, -6);
  const lastDate = sessions.reduce((max, s) => (s.date > max ? s.date : max), "");
  const topics = [...groupBy(sessions.filter((s) => s.topic), (s) => s.topic.trim()).entries()]
    .map(([topic, list]) => ({ topic, minutes: sumBy(list, (s) => s.durationMinutes), count: list.length }))
    .sort((a, b) => b.minutes - a.minutes);
  return {
    total,
    count: sessions.length,
    month: sumBy(sessions, (s) => (s.date >= monthFrom && s.date <= today ? s.durationMinutes : 0)),
    week: sumBy(sessions, (s) => (s.date >= weekFrom && s.date <= today ? s.durationMinutes : 0)),
    average: sessions.length ? Math.round(total / sessions.length) : 0,
    lastDate: lastDate || null,
    topics,
    days: new Set(sessions.map((s) => s.date)).size,
  };
}

/** Daily minutes for the last `days` days for a subject (sparkline). */
export function subjectDailySeries(subjectId, days = 28, today = todayKey()) {
  const from = addDays(today, -(days - 1));
  const map = new Map();
  for (const s of state.data.learningSessions) {
    if (s.subjectId === subjectId && s.date >= from && s.date <= today) map.set(s.date, (map.get(s.date) || 0) + s.durationMinutes);
  }
  return rangeKeys(from, today).map((d) => ({ date: d, minutes: map.get(d) || 0 }));
}

/* ---------- Consistency ---------- */

export function consistency(from, to, today = todayKey()) {
  const end = to > today ? today : to;
  const start = from;
  const byDate = minutesByDate();
  const days = end >= start ? rangeKeys(start, end) : [];
  const learningDays = days.filter((d) => byDate.get(d) > 0);
  const total = sumBy(days, (d) => byDate.get(d) || 0);
  const dailyGoal = findGoal("daily")?.targetMinutes || 0;
  const goalDays = dailyGoal ? days.filter((d) => (byDate.get(d) || 0) >= dailyGoal).length : null;
  return {
    days: days.length,
    learningDays: learningDays.length,
    total,
    averagePerDay: days.length ? Math.round(total / days.length) : 0,
    averagePerLearningDay: learningDays.length ? Math.round(total / learningDays.length) : 0,
    goalDays,
    goalRate: dailyGoal && days.length ? goalDays / days.length : null,
    dailyGoal,
  };
}

/* ---------- Patterns ---------- */

/** Spreads each session's minutes across the hours it covered. */
function minutesByHour(sessions) {
  const hours = new Array(24).fill(0);
  for (const s of sessions) {
    let cursor = timeToMinutes(s.startTime);
    let remaining = s.durationMinutes;
    while (remaining > 0) {
      const hour = Math.floor(cursor / 60) % 24;
      const chunk = Math.min(remaining, 60 - (cursor % 60));
      hours[hour] += chunk;
      remaining -= chunk;
      cursor += chunk;
    }
  }
  return hours;
}

export function learningPatterns(sessions = state.data.learningSessions) {
  const learningDays = new Set(sessions.map((s) => s.date));
  const enough = sessions.length >= PATTERN_MIN_SESSIONS && learningDays.size >= PATTERN_MIN_DAYS;
  const hours = minutesByHour(sessions);

  // Weekday averages are normalised by how many of that weekday the data spans.
  const weekdayTotals = new Array(7).fill(0);
  const weekdayActive = new Array(7).fill(0);
  for (const s of sessions) weekdayTotals[weekdayIndex(s.date)] += s.durationMinutes;
  learningDays.forEach((d) => weekdayActive[weekdayIndex(d)]++);

  const first = firstActivityDate();
  const weekdayOccurrences = new Array(7).fill(0);
  if (first) rangeKeys(first, todayKey()).forEach((d) => weekdayOccurrences[weekdayIndex(d)]++);

  const weekdayAverage = weekdayTotals.map((t, i) => (weekdayOccurrences[i] ? t / weekdayOccurrences[i] : 0));
  const weekdayRate = weekdayActive.map((a, i) => (weekdayOccurrences[i] ? a / weekdayOccurrences[i] : 0));

  // Best 2-hour window.
  let bestWindow = 0;
  let bestWindowMinutes = 0;
  for (let h = 0; h < 24; h++) {
    const m = hours[h] + hours[(h + 1) % 24];
    if (m > bestWindowMinutes) {
      bestWindowMinutes = m;
      bestWindow = h;
    }
  }

  const argmax = (arr) => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);
  const total = sumBy(sessions, (s) => s.durationMinutes);

  return {
    enough,
    sessionCount: sessions.length,
    averageSession: sessions.length ? Math.round(total / sessions.length) : 0,
    longestSession: sessions.reduce((max, s) => Math.max(max, s.durationMinutes), 0),
    hours,
    peakWindow: bestWindowMinutes ? { start: bestWindow, end: bestWindow + 2, minutes: bestWindowMinutes } : null,
    weekdayTotals,
    weekdayAverage,
    weekdayRate,
    mostActiveWeekday: total ? argmax(weekdayAverage) : null,
    mostConsistentWeekday: learningDays.size ? argmax(weekdayRate) : null,
    timerShare: sessions.length ? sessions.filter((s) => s.source === "timer").length / sessions.length : 0,
  };
}

/* ---------- Heatmap ---------- */

/** Quantile-free fixed thresholds relative to the daily goal (or 2h default). */
export function heatLevel(minutes, reference) {
  if (!minutes) return 0;
  const r = reference || 120;
  if (minutes < r * 0.34) return 1;
  if (minutes < r * 0.67) return 2;
  if (minutes < r) return 3;
  return 4;
}
