import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { signInFresh, signOutTest, flush } from "./helpers.js";
import { state } from "../../js/state.js";
import { createSubject, setSubjectArchived } from "../../js/services/subjects.js";
import { createManualSession, updateSession, saveTimerSession } from "../../js/services/learningSessions.js";
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

