import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { signInFresh, signOutTest, flush } from "./helpers.js";
import { state } from "../../js/state.js";
import { db } from "../../js/data/db.js";
import { createSubject, setSubjectArchived } from "../../js/services/subjects.js";
import { startTimer, pauseTimer, resumeTimer, stopTimer, discardTimer, elapsedMs, isRunning, initTimer } from "../../js/services/timer.js";
import { readJSON } from "../../js/utils/storage.js";

let subjectId;

beforeEach(async () => {
  await signInFresh();
  initTimer();
  subjectId = await createSubject({ name: "Math" });
  await flush();
});
after(signOutTest);

/** Moves the running timer's start back by `minutes`. */
function rewind(minutes) {
  const t = state.timer;
  const ms = minutes * 60000;
  state.timer = { ...t, startedAt: t.startedAt - ms, runningSince: t.runningSince && t.runningSince - ms };
}

test("startTimer persists per user and refuses invalid subjects", () => {
  assert.throws(() => startTimer({ subjectId: "" }), /Choose a subject/);
  startTimer({ subjectId, topic: "  Limits " });
  assert.equal(isRunning(), true);
  assert.equal(state.timer.topic, "Limits");
  assert.deepEqual(readJSON(`timer:${state.user.id}`), state.timer);
  assert.throws(() => startTimer({ subjectId }), /already running/);
});

test("archived subjects can't be tracked", async () => {
  await setSubjectArchived(subjectId, true);
  await flush();
  assert.throws(() => startTimer({ subjectId }), /Archived/);
});

test("pause freezes elapsed time and resume continues it", () => {
  assert.equal(elapsedMs({ accumulatedMs: 0, runningSince: 1_000 }, 61_000), 60_000);
  startTimer({ subjectId });
  rewind(5);
  pauseTimer();
  const paused = elapsedMs();
  assert.equal(isRunning(), false);
  assert.ok(paused >= 5 * 60000 && paused < 5 * 60000 + 1000);
  assert.equal(elapsedMs(state.timer, Date.now() + 60_000), paused);
  resumeTimer();
  assert.equal(isRunning(), true);
});

test("stopTimer writes exactly one session using the pinned end time", async () => {
  startTimer({ subjectId });
  rewind(10);
  const result = await stopTimer({ now: Date.now() });
  await flush();
  assert.deepEqual(result, { saved: true, minutes: 10, parts: 1 });
  assert.equal(state.timer, null);
  assert.equal(state.data.learningSessions.length, 1);
  assert.equal(state.data.learningSessions[0].durationMinutes, 10);
});

test("a failed write keeps the timer so no time is lost", async () => {
  startTimer({ subjectId });
  rewind(3);
  const store = db();
  const original = store.batch;
  store.batch = () => Promise.reject(new Error("network down"));
  try {
    await assert.rejects(stopTimer(), /network down/);
  } finally {
    store.batch = original;
  }
  assert.notEqual(state.timer, null);
  assert.equal(state.data.learningSessions.length, 0);
});

test("short timers are not saved and discard clears the timer", async () => {
  startTimer({ subjectId });
  assert.deepEqual(await stopTimer(), { saved: false, minutes: 0, parts: 0 });
  assert.equal(state.timer, null);
  startTimer({ subjectId });
  discardTimer();
  assert.equal(state.timer, null);
  assert.equal(readJSON(`timer:${state.user.id}`), null);
  await flush();
  assert.equal(state.data.learningSessions.length, 0);
});

test("a run across midnight is saved as one session per day", async () => {
  startTimer({ subjectId });
  const startedAt = new Date(2026, 9, 9, 23, 50).getTime();
  const now = new Date(2026, 9, 10, 1, 30).getTime();
  state.timer = { ...state.timer, startedAt, runningSince: startedAt, accumulatedMs: 0 };
  const result = await stopTimer({ now });
  await flush();
  assert.deepEqual(result, { saved: true, minutes: 100, parts: 2 });
  const sessions = [...state.data.learningSessions].sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(
    sessions.map((s) => [s.date, s.startTime, s.endTime, s.durationMinutes]),
    [
      ["2026-10-09", "23:50", "00:00", 10],
      ["2026-10-10", "00:00", "01:30", 90],
    ]
  );
  assert.equal(state.timer, null);
});
