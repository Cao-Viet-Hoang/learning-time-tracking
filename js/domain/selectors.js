/*
 * Read-only selectors over `state.data`.
 * Index-building selectors are memoized by array identity, so they recompute
 * only when Firestore delivers a new snapshot.
 */

import { state } from "../state.js";
import { memoByRef, sumBy } from "../utils/misc.js";

/* ---------- Subjects ---------- */

const subjectIndex = memoByRef((subjects) => new Map(subjects.map((s) => [s.id, s])));

const MISSING_SUBJECT = Object.freeze({ id: null, name: "Deleted subject", color: "blue", icon: "", archived: true, missing: true });

export function getSubject(id) {
  return subjectIndex(state.data.subjects).get(id) || { ...MISSING_SUBJECT, id };
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** Subjects that may be selected for new plans / sessions. */
export const activeSubjects = () => state.data.subjects.filter((s) => !s.archived).sort(byName);
export const archivedSubjects = () => state.data.subjects.filter((s) => s.archived).sort(byName);

/* ---------- Learning sessions ---------- */

/** Map<dateKey, Session[]> */
const sessionsByDateIndex = memoByRef((sessions) => {
  const map = new Map();
  for (const s of sessions) {
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date).push(s);
  }
  for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return map;
});

/** Map<dateKey, minutes> */
const minutesByDateIndex = memoByRef((sessions) => {
  const map = new Map();
  for (const s of sessions) map.set(s.date, (map.get(s.date) || 0) + (s.durationMinutes || 0));
  return map;
});

export const sessionsOn = (date) => sessionsByDateIndex(state.data.learningSessions).get(date) || [];
export const minutesOn = (date) => minutesByDateIndex(state.data.learningSessions).get(date) || 0;
export const minutesByDate = () => minutesByDateIndex(state.data.learningSessions);

export function sessionsBetween(from, to, sessions = state.data.learningSessions) {
  return sessions.filter((s) => s.date >= from && s.date <= to);
}

export function minutesBetween(from, to, subjectId = null) {
  return sumBy(sessionsBetween(from, to), (s) => (!subjectId || s.subjectId === subjectId ? s.durationMinutes : 0));
}

export function sortedSessions(direction = "desc", sessions = state.data.learningSessions) {
  const sign = direction === "asc" ? 1 : -1;
  return [...sessions].sort((a, b) => sign * (a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));
}

/* ---------- Planned sessions ---------- */

const plansByDateIndex = memoByRef((plans) => {
  const map = new Map();
  for (const p of plans) {
    if (!map.has(p.date)) map.set(p.date, []);
    map.get(p.date).push(p);
  }
  for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return map;
});

export const plansOn = (date) => plansByDateIndex(state.data.plannedSessions).get(date) || [];

export function plansBetween(from, to) {
  return state.data.plannedSessions.filter((p) => p.date >= from && p.date <= to);
}

/* ---------- Misc ---------- */

export function firstActivityDate() {
  let first = null;
  for (const s of state.data.learningSessions) if (!first || s.date < first) first = s.date;
  return first;
}

/** Most recently used topics for a subject (for input suggestions). */
export function recentTopics(subjectId, limit = 8) {
  const seen = new Map();
  for (const s of sortedSessions("desc")) {
    if (subjectId && s.subjectId !== subjectId) continue;
    const topic = (s.topic || "").trim();
    if (topic && !seen.has(topic.toLowerCase())) seen.set(topic.toLowerCase(), topic);
    if (seen.size >= limit) break;
  }
  if (seen.size < limit) {
    for (const p of state.data.plannedSessions) {
      if (subjectId && p.subjectId !== subjectId) continue;
      const topic = (p.topic || "").trim();
      if (topic && !seen.has(topic.toLowerCase())) seen.set(topic.toLowerCase(), topic);
      if (seen.size >= limit) break;
    }
  }
  return [...seen.values()];
}
