/* Subject service: controlled vocabulary of things the user learns. */

import { db, currentUserId } from "../data/db.js";
import { state } from "../state.js";
import { assertValid } from "../utils/errors.js";

const COLLECTION = "subjects";

/** Fixed categorical order — new subjects take the next unused slot. */
export const SUBJECT_COLORS = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"];

export const SUBJECT_ICONS = ["📘", "💻", "🧠", "🌐", "🗣️", "🇯🇵", "🔧", "🐳", "📐", "🎵", "🧪", "✍️", "📊", "🎨", "⚙️", "🤖"];

export const colorVar = (color) => `var(--c-${SUBJECT_COLORS.includes(color) ? color : "blue"})`;

export function nextColor(subjects = state.data.subjects) {
  const used = subjects.filter((s) => !s.archived).map((s) => s.color);
  return SUBJECT_COLORS.find((c) => !used.includes(c)) || SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
}

function validate(input, id) {
  const name = (input.name || "").trim();
  const duplicate = state.data.subjects.find((s) => s.id !== id && s.name.trim().toLowerCase() === name.toLowerCase());
  assertValid({
    name: !name
      ? "Give the subject a name."
      : name.length > 60
        ? "Keep the name under 60 characters."
        : duplicate
          ? `“${duplicate.name}” already exists${duplicate.archived ? " (archived — restore it instead)" : ""}.`
          : "",
    description: (input.description || "").length > 280 ? "Keep the description under 280 characters." : "",
  });
  return {
    name,
    description: (input.description || "").trim(),
    icon: (input.icon || "").trim().slice(0, 8),
    color: SUBJECT_COLORS.includes(input.color) ? input.color : nextColor(),
  };
}

export async function createSubject(input) {
  const store = db();
  const clean = validate(input);
  const id = store.newId(COLLECTION);
  await store.set(COLLECTION, id, {
    ...clean,
    userId: currentUserId(),
    archived: false,
    createdAt: store.stamp(),
    updatedAt: store.stamp(),
  });
  return id;
}

export async function updateSubject(id, input) {
  const store = db();
  const clean = validate(input, id);
  await store.update(COLLECTION, id, { ...clean, updatedAt: store.stamp() });
}

export async function setSubjectArchived(id, archived) {
  const store = db();
  await store.update(COLLECTION, id, { archived, updatedAt: store.stamp() });
}
