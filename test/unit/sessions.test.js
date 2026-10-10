import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { signInFresh, signOutTest, flush } from "./helpers.js";
import { state } from "../../js/state.js";
import { createSubject, setSubjectArchived } from "../../js/services/subjects.js";
import { createManualSession, updateSession, saveTimerSession, splitAtMidnight } from "../../js/services/learningSessions.js";
import { createPlannedSession } from "../../js/services/plannedSessions.js";
import { addDays, todayKey } from "../../js/utils/time.js";

let subjectId;
const yesterday = () => addDays(todayKey(), -1);

beforeEach(async () => {
  await signInFresh();
  subjectId = await createSubject({ name: "Math" });
  await flush();
});
after(signOutTest);

test("manual session computes its duration", async () => {
  const id = await createManualSession({ date: yesterday(), startTime: "09:00", endTime: "10:30", subjectId, topic: " Limits " });
  await flush();
  const session = state.data.learningSessions.find((s) => s.id === id);
  assert.equal(session.durationMinutes, 90);
  assert.equal(session.topic, "Limits");
  assert.equal(session.source, "manual");
});

test("manual session validation", async () => {
  const base = { date: yesterday(), startTime: "09:00", endTime: "10:00", subjectId };
  await assert.rejects(createManualSession({ ...base, endTime: "08:00" }), (e) => Boolean(e.fields.endTime));
  await assert.rejects(createManualSession({ ...base, date: addDays(todayKey(), 1) }), (e) => Boolean(e.fields.date));
  await assert.rejects(createManualSession({ ...base, subjectId: "" }), (e) => Boolean(e.fields.subjectId));
  await assert.rejects(createManualSession({ ...base, startTime: "9am" }), (e) => Boolean(e.fields.startTime));
});

test("overlapping sessions are flagged as a conflict unless allowed", async () => {
  const base = { date: yesterday(), subjectId };
  await createManualSession({ ...base, startTime: "09:00", endTime: "10:00" });
  await flush();
  await assert.rejects(createManualSession({ ...base, startTime: "09:30", endTime: "10:30" }), (e) => e.code === "conflict");
  // Touching edges are not an overlap.
  await createManualSession({ ...base, startTime: "10:00", endTime: "11:00" });
  await createManualSession({ ...base, startTime: "09:30", endTime: "10:30" }, { allowOverlap: true });
  await flush();
  assert.equal(state.data.learningSessions.length, 3);
});

test("archived subjects can't be used for new sessions but old ones stay editable", async () => {
  const id = await createManualSession({ date: yesterday(), startTime: "09:00", endTime: "10:00", subjectId });
  await setSubjectArchived(subjectId, true);
  await flush();
  await assert.rejects(createManualSession({ date: yesterday(), startTime: "11:00", endTime: "12:00", subjectId }), (e) => Boolean(e.fields.subjectId));
  await updateSession(id, { date: yesterday(), startTime: "09:00", endTime: "10:00", subjectId, topic: "kept" });
  await flush();
  assert.equal(state.data.learningSessions.find((s) => s.id === id).topic, "kept");
});

test("saveTimerSession records start, end and rounded duration", async () => {
  const startedAt = new Date(2026, 9, 9, 14, 0).getTime();
  const elapsedMs = 25 * 60000 + 31000;
  await saveTimerSession({ subjectId, topic: "Series", note: "", startedAt, elapsedMs }, startedAt + elapsedMs);
  await flush();
  const [session] = state.data.learningSessions;
  assert.equal(session.date, "2026-10-09");
  assert.equal(session.startTime, "14:00");
  assert.equal(session.endTime, "14:25");
  assert.equal(session.durationMinutes, 26);
  assert.equal(session.source, "timer");
});

test("saveTimerSession refuses sessions under a minute", async () => {
  await assert.rejects(saveTimerSession({ subjectId, startedAt: Date.now(), elapsedMs: 20000 }), /shorter than a minute/);
});

test("planned blocks detect conflicts and invalid ranges", async () => {
  const date = todayKey();
  await createPlannedSession({ date, startTime: "09:00", endTime: "10:00", subjectId });
  await flush();
  await assert.rejects(createPlannedSession({ date, startTime: "09:30", endTime: "10:30", subjectId }), (e) => e.code === "conflict");
  await assert.rejects(createPlannedSession({ date, startTime: "10:00", endTime: "09:00", subjectId }), (e) => Boolean(e.fields.endTime));
});

test("copying the previous day twice doesn't duplicate blocks", async () => {
  const { copyDayPlans } = await import("../../js/services/plannedSessions.js");
  const today = todayKey();
  await createPlannedSession({ date: yesterday(), startTime: "09:00", endTime: "10:00", subjectId });
  await createPlannedSession({ date: yesterday(), startTime: "11:00", endTime: "12:00", subjectId });
  await flush();
  assert.equal(await copyDayPlans(yesterday(), today), 2);
  await flush();
  await assert.rejects(copyDayPlans(yesterday(), today), /already on this day/);
  await flush();
  assert.equal(state.data.plannedSessions.filter((p) => p.date === today).length, 2);
});

test("undoing a plan delete restores the same id and status", async () => {
  const { deletePlannedSession, restorePlannedSession, setPlanStatus } = await import("../../js/services/plannedSessions.js");
  const id = await createPlannedSession({ date: todayKey(), startTime: "09:00", endTime: "10:00", subjectId });
  await setPlanStatus(id, "completed");
  await flush();
  const plan = state.data.plannedSessions.find((p) => p.id === id);
  await deletePlannedSession(id);
  await restorePlannedSession(plan);
  await restorePlannedSession(plan); // a repeated undo is harmless
  await flush();
  assert.equal(state.data.plannedSessions.length, 1);
  assert.equal(state.data.plannedSessions[0].id, id);
  assert.equal(state.data.plannedSessions[0].status, "completed");
});

test("splitAtMidnight keeps same-day runs whole", () => {
  const start = new Date(2026, 9, 9, 14, 0).getTime();
  assert.deepEqual(splitAtMidnight(start, start + 45 * 60000, 45), [{ date: "2026-10-09", startTime: "14:00", endTime: "14:45", durationMinutes: 45 }]);
});

test("splitAtMidnight shares minutes by time spent each day and keeps the exact total", () => {
  const start = new Date(2026, 9, 9, 23, 0).getTime();
  const end = new Date(2026, 9, 10, 1, 0).getTime();
  // 120 min of wall-clock with a 30 min pause -> 90 tracked minutes, shared evenly.
  const parts = splitAtMidnight(start, end, 90);
  assert.deepEqual(parts.map((p) => [p.date, p.startTime, p.endTime, p.durationMinutes]), [
    ["2026-10-09", "23:00", "00:00", 45],
    ["2026-10-10", "00:00", "01:00", 45],
  ]);
  // Uneven split with rounding still adds up.
  const odd = splitAtMidnight(new Date(2026, 9, 9, 23, 59, 20).getTime(), new Date(2026, 9, 10, 0, 7).getTime(), 8);
  assert.equal(odd.reduce((sum, p) => sum + p.durationMinutes, 0), 8);
});

test("splitAtMidnight drops a part that rounds to zero minutes", () => {
  const start = new Date(2026, 9, 9, 23, 59, 50).getTime();
  const end = new Date(2026, 9, 10, 0, 30).getTime();
  const parts = splitAtMidnight(start, end, 30);
  assert.deepEqual(parts.map((p) => [p.date, p.durationMinutes]), [["2026-10-10", 30]]);
});

test("splitAtMidnight covers runs spanning several days", () => {
  const start = new Date(2026, 9, 8, 22, 0).getTime();
  const end = new Date(2026, 9, 10, 2, 0).getTime(); // 28h
  const parts = splitAtMidnight(start, end, 28 * 60);
  assert.deepEqual(parts.map((p) => [p.date, p.durationMinutes]), [
    ["2026-10-08", 120],
    ["2026-10-09", 1440],
    ["2026-10-10", 120],
  ]);
});

test("a cross-midnight timer save is all-or-nothing", async () => {
  const { db } = await import("../../js/data/db.js");
  const store = db();
  const original = store.batch;
  store.batch = () => Promise.reject(new Error("offline"));
  try {
    const startedAt = new Date(2026, 9, 9, 23, 30).getTime();
    await assert.rejects(saveTimerSession({ subjectId, startedAt, elapsedMs: 60 * 60000 }, startedAt + 60 * 60000), /offline/);
  } finally {
    store.batch = original;
  }
  await flush();
  assert.equal(state.data.learningSessions.length, 0);
});
