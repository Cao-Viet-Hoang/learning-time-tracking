import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { signInFresh, signOutTest, flush } from "./helpers.js";
import { state } from "../../js/state.js";
import { createSubject, updateSubject, setSubjectArchived, nextColor, SUBJECT_COLORS } from "../../js/services/subjects.js";
import { ValidationError } from "../../js/utils/errors.js";

beforeEach(signInFresh);
after(signOutTest);

test("createSubject stores a cleaned, user-scoped document", async () => {
  const id = await createSubject({ name: "  Embedded C  ", description: " pointers ", icon: "💻", color: "green" });
  await flush();
  const subject = state.data.subjects.find((s) => s.id === id);
  assert.equal(subject.name, "Embedded C");
  assert.equal(subject.description, "pointers");
  assert.equal(subject.color, "green");
  assert.equal(subject.archived, false);
  assert.equal(subject.userId, state.user.id);
  assert.equal(typeof subject.createdAt, "number");
});

test("createSubject rejects empty, too long and duplicate names", async () => {
  await assert.rejects(createSubject({ name: "   " }), (e) => e instanceof ValidationError && Boolean(e.fields.name));
  await assert.rejects(createSubject({ name: "x".repeat(61) }), (e) => e instanceof ValidationError && Boolean(e.fields.name));
  await createSubject({ name: "Math" });
  await flush();
  await assert.rejects(createSubject({ name: "math" }), (e) => /already exists/.test(e.fields.name));
  assert.equal(state.data.subjects.length, 1);
});

test("unknown colors fall back to the next unused color", async () => {
  await createSubject({ name: "A", color: "blue" });
  await flush();
  const id = await createSubject({ name: "B", color: "not-a-color" });
  await flush();
  const b = state.data.subjects.find((s) => s.id === id);
  assert.ok(SUBJECT_COLORS.includes(b.color));
  assert.notEqual(b.color, "blue");
});

test("nextColor skips colors used by active subjects only", () => {
  const subjects = [
    { color: "blue", archived: false },
    { color: "orange", archived: true },
  ];
  assert.equal(nextColor(subjects), "orange");
});

test("updateSubject keeps its own name and archive toggles", async () => {
  const id = await createSubject({ name: "Physics" });
  await flush();
  await updateSubject(id, { name: "Physics", description: "mechanics" });
  await setSubjectArchived(id, true);
  await flush();
  const subject = state.data.subjects.find((s) => s.id === id);
  assert.equal(subject.description, "mechanics");
  assert.equal(subject.archived, true);
});
