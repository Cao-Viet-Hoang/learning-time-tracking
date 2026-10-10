import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { signInFresh, signOutTest, flush } from "./helpers.js";
import { state } from "../../js/state.js";
import { createSubject, updateSubject, setSubjectArchived, nextColor, SUBJECT_COLORS, PASTEL_COLORS, SUBJECT_ICONS, colorVar, inkFor, isCustomColor } from "../../js/services/subjects.js";
import { ValidationError } from "../../js/utils/errors.js";

beforeEach(signInFresh);
after(signOutTest);

test("createSubject stores a cleaned document", async () => {
  const id = await createSubject({ name: "  Embedded C  ", description: " pointers ", icon: "💻", color: "green" });
  await flush();
  const subject = state.data.subjects.find((s) => s.id === id);
  assert.equal(subject.name, "Embedded C");
  assert.equal(subject.description, "pointers");
  assert.equal(subject.color, "green");
  assert.equal(subject.archived, false);
  assert.equal("userId" in subject, false, "documents are scoped by path (users/{id}/subjects), not a field");
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

test("pastel and custom colours are stored; invalid ones fall back", async () => {
  const pastel = await createSubject({ name: "Art", color: "pastel-lavender" });
  const custom = await createSubject({ name: "Music", color: "#A1B2C3" });
  const bogus = await createSubject({ name: "Bogus", color: "#12345" });
  await flush();
  const byId = (id) => state.data.subjects.find((s) => s.id === id);
  assert.equal(byId(pastel).color, "pastel-lavender");
  assert.equal(byId(custom).color, "#a1b2c3");
  assert.ok(SUBJECT_COLORS.includes(byId(bogus).color));
});

test("colorVar maps palette tokens to CSS variables and passes custom hex through", () => {
  assert.equal(colorVar("blue"), "var(--c-blue)");
  assert.equal(colorVar("pastel-mint"), "var(--c-pastel-mint)");
  assert.equal(colorVar("#a1b2c3"), "#a1b2c3");
  assert.equal(colorVar("nope"), "var(--c-blue)");
  assert.equal(isCustomColor("#ABCDEF"), true);
  assert.equal(isCustomColor("red"), false);
});

test("inkFor picks dark text on pastels and white on deep colours", () => {
  for (const c of PASTEL_COLORS) assert.equal(inkFor(c), "#1a1a1a", c);
  assert.equal(inkFor("violet"), "#fff");
  assert.equal(inkFor("#000000"), "#fff");
  assert.equal(inkFor("#ffffff"), "#1a1a1a");
});

test("palette and icon lists have no duplicates", () => {
  assert.equal(new Set(SUBJECT_COLORS).size, SUBJECT_COLORS.length);
  assert.equal(new Set(SUBJECT_ICONS).size, SUBJECT_ICONS.length);
  assert.ok(PASTEL_COLORS.length >= 12);
  assert.ok(SUBJECT_ICONS.length >= 50);
});
