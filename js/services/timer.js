/*
 * Timer service.
 * The running timer lives in localStorage (per user) so it survives reloads
 * and navigation; only the finished session is written to Firestore.
 *
 * Shape: { subjectId, topic, note, plannedSessionId,
 *          startedAt, runningSince | null, accumulatedMs }
 */

import { state, setState, subscribe } from "../state.js";
import { readJSON, writeJSON, removeKey, onExternalChange } from "../utils/storage.js";
import { ValidationError } from "../utils/errors.js";
import { saveTimerSession } from "./learningSessions.js";

const keyFor = (userId) => `timer:${userId}`;
let detachExternal = null;

export function elapsedMs(timer = state.timer, now = Date.now()) {
  if (!timer) return 0;
  return timer.accumulatedMs + (timer.runningSince ? now - timer.runningSince : 0);
}

export const isRunning = (timer = state.timer) => Boolean(timer?.runningSince);

function persist(timer) {
  const userId = state.user?.id;
  if (!userId) return;
  if (timer) writeJSON(keyFor(userId), timer);
  else removeKey(keyFor(userId));
  setState({ timer });
}

/** Loads the persisted timer for the signed-in user and keeps tabs in sync. */
export function initTimer() {
  detachExternal?.();
  const userId = state.user?.id;
  if (!userId) {
    setState({ timer: null });
    return;
  }
  setState({ timer: readJSON(keyFor(userId)) });
  detachExternal = onExternalChange(keyFor(userId), (timer) => setState({ timer }));
}

export function startTimer({ subjectId, topic = "", note = "", plannedSessionId = null }) {
  if (state.timer) throw new ValidationError("A timer is already running. Stop it first.");
  const subject = state.data.subjects.find((s) => s.id === subjectId);
  if (!subject) throw new ValidationError("Choose a subject to start tracking.", { subjectId: "Choose a subject." });
  if (subject.archived) throw new ValidationError("Archived subjects can't be tracked.", { subjectId: "This subject is archived." });
  const now = Date.now();
  persist({ subjectId, topic: topic.trim(), note: note.trim(), plannedSessionId, startedAt: now, runningSince: now, accumulatedMs: 0 });
}

export function pauseTimer() {
  const t = state.timer;
  if (!t?.runningSince) return;
  persist({ ...t, accumulatedMs: elapsedMs(t), runningSince: null });
}

export function resumeTimer() {
  const t = state.timer;
  if (!t || t.runningSince) return;
  persist({ ...t, runningSince: Date.now() });
}

export function updateTimerDetails(patch) {
  if (!state.timer) return;
  persist({ ...state.timer, ...patch });
}

/** Saves the session to the store and clears the timer. Returns { saved, minutes }. */
export async function stopTimer() {
  const t = state.timer;
  if (!t) return { saved: false, minutes: 0 };
  const snapshot = { ...t, elapsedMs: elapsedMs(t) };
  const minutes = Math.round(snapshot.elapsedMs / 60000);
  if (minutes < 1) {
    persist(null);
    return { saved: false, minutes: 0 };
  }
  // Keep the timer until the write is accepted, so a failure never loses time.
  await saveTimerSession(snapshot);
  persist(null);
  return { saved: true, minutes };
}

export function discardTimer() {
  persist(null);
}

/** Clears the timer view when the user signs out. */
subscribe((s, keys) => {
  if (keys.has("user") && !s.user) {
    detachExternal?.();
    detachExternal = null;
    if (s.timer) setState({ timer: null });
  }
});
