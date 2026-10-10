/*
 * Learning session service — the single source for all analytics.
 * Timer and manual sessions share one shape; only `source` differs.
 */

import { db, currentUserId } from "../data/db.js";
import { state } from "../state.js";
import { ValidationError, assertValid } from "../utils/errors.js";
import { isDateKey, isTimeString, timeToMinutes, spanMinutes, todayKey, toDateKey, toTimeString } from "../utils/time.js";

const COLLECTION = "learningSessions";

function checkSubject(subjectId, previousSubjectId) {
  const subject = state.data.subjects.find((s) => s.id === subjectId);
  if (!subjectId) return "Choose a subject.";
  if (!subject) return "That subject no longer exists.";
  if (subject.archived && subjectId !== previousSubjectId) return "Archived subjects can't be used for new sessions.";
  return "";
}

export function findSessionOverlaps({ date, startTime, endTime }, ignoreId = null) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return state.data.learningSessions.filter(
    (s) => s.id !== ignoreId && s.date === date && timeToMinutes(s.startTime) < end && timeToMinutes(s.startTime) + s.durationMinutes > start
  );
}

function validateManual(input, existing, { allowOverlap = false } = {}) {
  const errors = {
    date: !isDateKey(input.date) ? "Pick a valid date." : input.date > todayKey() ? "You can't log a session in the future." : "",
    startTime: isTimeString(input.startTime) ? "" : "Enter a start time (HH:MM).",
    endTime: isTimeString(input.endTime) ? "" : "Enter an end time (HH:MM).",
    subjectId: checkSubject(input.subjectId, existing?.subjectId),
    topic: (input.topic || "").length > 120 ? "Keep the topic under 120 characters." : "",
    note: (input.note || "").length > 2000 ? "Keep the note under 2000 characters." : "",
  };
  if (!errors.startTime && !errors.endTime) {
    const start = timeToMinutes(input.startTime);
    const end = timeToMinutes(input.endTime);
    if (end <= start) errors.endTime = "End time must be after the start time.";
    else if (!errors.date && input.date === todayKey() && end > timeToMinutes(toTimeString()) + 1) {
      errors.endTime = "This session would end in the future.";
    }
  }
  assertValid(errors);

  const clean = {
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    durationMinutes: spanMinutes(input.startTime, input.endTime),
    subjectId: input.subjectId,
    topic: (input.topic || "").trim(),
    note: (input.note || "").trim(),
    plannedSessionId: input.plannedSessionId || existing?.plannedSessionId || null,
  };

  if (!allowOverlap) {
    const overlaps = findSessionOverlaps(clean, existing?.id);
    if (overlaps.length) {
      const error = new ValidationError("This overlaps a session you already logged.", {
        startTime: `Overlaps ${overlaps.map((s) => `${s.startTime}–${s.endTime}`).join(", ")}.`,
      });
      error.code = "conflict";
      throw error;
    }
  }
  return clean;
}

export async function createManualSession(input, options) {
  const store = db();
  const clean = validateManual(input, null, options);
  const id = store.newId(COLLECTION);
  await store.set(COLLECTION, id, {
    ...clean,
    userId: currentUserId(),
    source: "manual",
    createdAt: store.stamp(),
    updatedAt: store.stamp(),
  });
  return id;
}

/**
 * Updates a session. Manual sessions are fully editable; timer sessions keep
 * their measured times and only allow subject/topic/note edits.
 */
export async function updateSession(id, input, options) {
  const store = db();
  const existing = state.data.learningSessions.find((s) => s.id === id);
  if (!existing) throw new ValidationError("That session no longer exists.");

  let patch;
  if (existing.source === "manual") {
    patch = validateManual(input, existing, options);
  } else {
    assertValid({
      subjectId: checkSubject(input.subjectId, existing.subjectId),
      topic: (input.topic || "").length > 120 ? "Keep the topic under 120 characters." : "",
    });
    patch = { subjectId: input.subjectId, topic: (input.topic || "").trim(), note: (input.note || "").trim() };
  }
  await store.update(COLLECTION, id, { ...patch, updatedAt: store.stamp() });
}

export async function deleteSession(id) {
  await db().remove(COLLECTION, id);
}

/** Re-creates a just-deleted session (undo). */
export async function restoreSession(session) {
  const store = db();
  const { id, createdAt, updatedAt, ...data } = session;
  await store.set(COLLECTION, id, { ...data, userId: currentUserId(), createdAt: store.stamp(), updatedAt: store.stamp() });
}

/**
 * Splits the wall-clock span [startedAt, endedAt] at local midnights and shares
 * `totalMinutes` between the days in proportion to the time spent in each, so a
 * session from 23:50 to 01:30 counts toward both days' goals. (Pauses aren't
 * recorded with timestamps, so they are assumed to be spread evenly.)
 * Returns [{ date, startTime, endTime, durationMinutes }] with no empty parts;
 * the minutes always add up to totalMinutes.
 */
export function splitAtMidnight(startedAt, endedAt, totalMinutes) {
  const parts = [];
  let cursor = new Date(startedAt);
  const end = new Date(Math.max(endedAt, startedAt));
  while (cursor < end) {
    const midnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const partEnd = midnight < end ? midnight : end;
    parts.push({ from: cursor, to: partEnd });
    cursor = partEnd;
  }
  if (!parts.length) parts.push({ from: new Date(startedAt), to: end });

  // Largest-remainder rounding keeps the total exact.
  const span = end - new Date(startedAt) || 1;
  const shares = parts.map((p) => ((p.to - p.from) / span) * totalMinutes);
  const minutes = shares.map(Math.floor);
  let left = totalMinutes - minutes.reduce((a, b) => a + b, 0);
  shares
    .map((share, i) => [share - Math.floor(share), i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left > 0) {
        minutes[i] += 1;
        left -= 1;
      }
    });

  return parts
    .map((p, i) => ({ date: toDateKey(p.from), startTime: toTimeString(p.from), endTime: toTimeString(p.to), durationMinutes: minutes[i] }))
    .filter((p) => p.durationMinutes > 0);
}

/**
 * Persists a finished timer run, as one session per calendar day it touched.
 * `timer` = { subjectId, topic, note, plannedSessionId, startedAt, elapsedMs }
 * Returns the ids of the written sessions.
 */
export async function saveTimerSession(timer, endedAt = Date.now()) {
  const durationMinutes = Math.round(timer.elapsedMs / 60000);
  if (durationMinutes < 1) throw new ValidationError("Sessions shorter than a minute are not saved.");
  const subjectError = checkSubject(timer.subjectId, timer.subjectId);
  if (subjectError) throw new ValidationError(subjectError);

  const store = db();
  const userId = currentUserId();
  const ops = splitAtMidnight(timer.startedAt, endedAt, durationMinutes).map((part) => ({
    type: "set",
    collection: COLLECTION,
    id: store.newId(COLLECTION),
    data: {
      userId,
      ...part,
      subjectId: timer.subjectId,
      topic: (timer.topic || "").trim(),
      note: (timer.note || "").trim(),
      plannedSessionId: timer.plannedSessionId || null,
      source: "timer",
      createdAt: store.stamp(),
      updatedAt: store.stamp(),
    },
  }));
  // One batch: either every day's part is saved or none is (the timer then stays running).
  await store.batch(ops);
  return ops.map((op) => op.id);
}
