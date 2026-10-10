/*
 * Planned session service.
 * Stored `status` is the user's intent: "planned" | "completed" | "skipped".
 * Display states (missed, partial, in progress…) are derived in domain/plans.js.
 */

import { db, currentUserId } from "../data/db.js";
import { state } from "../state.js";
import { ValidationError, assertValid } from "../utils/errors.js";
import { isDateKey, isTimeString, timeToMinutes, addDays } from "../utils/time.js";

const COLLECTION = "plannedSessions";
export const PLAN_STATUSES = ["planned", "completed", "skipped"];

export function findConflicts({ date, startTime, endTime }, ignoreId = null) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return state.data.plannedSessions.filter(
    (p) => p.id !== ignoreId && p.date === date && p.status !== "skipped" && timeToMinutes(p.startTime) < end && timeToMinutes(p.endTime) > start
  );
}

function validate(input, id, { allowConflicts = false } = {}) {
  const subject = state.data.subjects.find((s) => s.id === input.subjectId);
  const existing = id ? state.data.plannedSessions.find((p) => p.id === id) : null;
  const keepsArchivedSubject = existing && existing.subjectId === input.subjectId;

  const errors = {
    date: isDateKey(input.date) ? "" : "Pick a valid date.",
    startTime: isTimeString(input.startTime) ? "" : "Enter a start time (HH:MM).",
    endTime: isTimeString(input.endTime) ? "" : "Enter an end time (HH:MM).",
    subjectId: !input.subjectId
      ? "Choose a subject."
      : !subject
        ? "That subject no longer exists."
        : subject.archived && !keepsArchivedSubject
          ? "Archived subjects can't be used for new plans."
          : "",
    topic: (input.topic || "").length > 120 ? "Keep the topic under 120 characters." : "",
    note: (input.note || "").length > 1000 ? "Keep the note under 1000 characters." : "",
  };
  if (!errors.startTime && !errors.endTime && timeToMinutes(input.endTime) <= timeToMinutes(input.startTime)) {
    errors.endTime = "End time must be after the start time.";
  }
  assertValid(errors);

  const clean = {
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    subjectId: input.subjectId,
    topic: (input.topic || "").trim(),
    note: (input.note || "").trim(),
  };

  if (!allowConflicts) {
    const conflicts = findConflicts(clean, id);
    if (conflicts.length) {
      const error = new ValidationError("This block overlaps another plan.", {
        startTime: `Overlaps ${conflicts.map((c) => `${c.startTime}–${c.endTime}`).join(", ")}.`,
      });
      error.code = "conflict";
      error.conflicts = conflicts;
      throw error;
    }
  }
  return clean;
}

export async function createPlannedSession(input, options) {
  const store = db();
  const clean = validate(input, null, options);
  const id = store.newId(COLLECTION);
  await store.set(COLLECTION, id, {
    ...clean,
    userId: currentUserId(),
    status: "planned",
    createdAt: store.stamp(),
    updatedAt: store.stamp(),
  });
  return id;
}

export async function updatePlannedSession(id, input, options) {
  const store = db();
  const clean = validate(input, id, options);
  await store.update(COLLECTION, id, { ...clean, updatedAt: store.stamp() });
}

export async function setPlanStatus(id, status) {
  if (!PLAN_STATUSES.includes(status)) throw new ValidationError("Unknown status.");
  const store = db();
  await store.update(COLLECTION, id, { status, updatedAt: store.stamp() });
}

export async function deletePlannedSession(id) {
  await db().remove(COLLECTION, id);
}

/**
 * Re-creates a just-deleted plan (undo) under its original id, so its status
 * and the sessions linked to it via plannedSessionId come back intact.
 */
export async function restorePlannedSession(plan) {
  const store = db();
  const { id, createdAt, updatedAt, ...data } = plan;
  await store.set(COLLECTION, id, { ...data, userId: currentUserId(), createdAt: store.stamp(), updatedAt: store.stamp() });
}

/** Copies a plan to another date (default: the next day), keeping its time block. */
export async function duplicatePlannedSession(id, targetDate) {
  const source = state.data.plannedSessions.find((p) => p.id === id);
  if (!source) throw new ValidationError("That plan no longer exists.");
  const subject = state.data.subjects.find((s) => s.id === source.subjectId);
  if (!subject || subject.archived) throw new ValidationError("The plan's subject is archived, so it can't be reused.");
  const date = targetDate || addDays(source.date, 1);
  return createPlannedSession({ ...source, date }, { allowConflicts: true });
}

/** Copies every plan of one day to another day. */
export async function copyDayPlans(fromDate, toDate) {
  const store = db();
  const userId = currentUserId();
  const activeSubjectIds = new Set(state.data.subjects.filter((s) => !s.archived).map((s) => s.id));
  const sources = state.data.plannedSessions.filter((p) => p.date === fromDate && activeSubjectIds.has(p.subjectId));
  if (!sources.length) throw new ValidationError("There is nothing to copy from that day.");
  // Copying twice (or onto a day that is already planned) must not stack duplicate blocks.
  const fresh = sources.filter((p) => !findConflicts({ date: toDate, startTime: p.startTime, endTime: p.endTime }).length);
  if (!fresh.length) throw new ValidationError("Those blocks are already on this day.");
  const ops = fresh.map((p) => ({
    type: "set",
    collection: COLLECTION,
    id: store.newId(COLLECTION),
    data: {
      userId,
      date: toDate,
      startTime: p.startTime,
      endTime: p.endTime,
      subjectId: p.subjectId,
      topic: p.topic || "",
      note: p.note || "",
      status: "planned",
      createdAt: store.stamp(),
      updatedAt: store.stamp(),
    },
  }));
  await store.batch(ops);
  return ops.length;
}
