/* Subject service: controlled vocabulary of things the user learns. */

import { db } from "../data/db.js";
import { state } from "../state.js";
import { assertValid } from "../utils/errors.js";

const COLLECTION = "subjects";

/** Vivid palette: fixed categorical order — new subjects take the next unused slot. */
export const VIVID_COLORS = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"];

/** Soft pastel palette (CSS tokens --c-pastel-*). */
export const PASTEL_COLORS = [
  "pastel-rose",
  "pastel-peach",
  "pastel-apricot",
  "pastel-lemon",
  "pastel-lime",
  "pastel-mint",
  "pastel-sage",
  "pastel-teal",
  "pastel-sky",
  "pastel-periwinkle",
  "pastel-lavender",
  "pastel-lilac",
  "pastel-mauve",
  "pastel-sand",
  "pastel-stone",
  "pastel-coral",
];

export const SUBJECT_COLORS = [...VIVID_COLORS, ...PASTEL_COLORS];

/** Light-theme hex of every palette token, used to pick readable text on top of a colour. */
const PALETTE_HEX = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
  magenta: "#e87ba4",
  green: "#008300",
  violet: "#4a3aa7",
  red: "#e34948",
  "pastel-rose": "#f4b6c2",
  "pastel-peach": "#f8c8a8",
  "pastel-apricot": "#f6d29b",
  "pastel-lemon": "#efe08e",
  "pastel-lime": "#cfe6a0",
  "pastel-mint": "#a8e0c4",
  "pastel-sage": "#bccfb0",
  "pastel-teal": "#98d4d2",
  "pastel-sky": "#a9d2f2",
  "pastel-periwinkle": "#b4bdf2",
  "pastel-lavender": "#c9b8ef",
  "pastel-lilac": "#dcb4e6",
  "pastel-mauve": "#d9b2c4",
  "pastel-sand": "#e3d2b4",
  "pastel-stone": "#c9c6bf",
  "pastel-coral": "#f5a99e",
};

export const SUBJECT_ICONS = [
  // study & reading
  "📘", "📗", "📕", "📙", "📚", "📓", "📝", "✍️", "🖊️", "🎓", "🏫", "🔖",
  // tech & engineering
  "💻", "⌨️", "🖥️", "📱", "🤖", "🧠", "⚙️", "🔧", "🛠️", "🔌", "💾", "🐳", "🐍", "☕", "🌐", "🔒",
  // science & maths
  "📐", "📏", "🧮", "📊", "📈", "🧪", "🔬", "🔭", "🧬", "⚛️", "🌍", "🪐",
  // languages & humanities (no flag emoji: Windows renders them as letters)
  "🗣️", "💬", "🔤", "🔠", "🈶", "🀄", "🌏", "🗺️", "📜", "🏛️", "🎭", "📖",
  // creative & life
  "🎨", "🎵", "🎸", "🎹", "📷", "🎬", "✏️", "🧘", "🏃", "💪", "🍳", "💰", "⚖️", "🩺", "🌱", "⭐", "💡", "🧩", "🎯", "🗂️",
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** True for a custom colour picked with the colour wheel ("#rrggbb"). */
export const isCustomColor = (color) => HEX_RE.test(color || "");


export const colorVar = (color) => (isCustomColor(color) ? color : `var(--c-${SUBJECT_COLORS.includes(color) ? color : "blue"})`);

/** Hex for any stored colour (palette token or custom). */
export const colorHex = (color) => (isCustomColor(color) ? color.toLowerCase() : PALETTE_HEX[color] || PALETTE_HEX.blue);

/** Black or white, whichever reads better on top of `color` (WCAG relative luminance). */
export function inkFor(color) {
  const hex = colorHex(color);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against white vs. against near-black (#1a1a1a ≈ 0.010).
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.06) ? "#fff" : "#1a1a1a";
}

export function nextColor(subjects = state.data.subjects) {
  const used = subjects.filter((s) => !s.archived).map((s) => s.color);
  return SUBJECT_COLORS.find((c) => !used.includes(c)) || VIVID_COLORS[subjects.length % VIVID_COLORS.length];
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
    color: isCustomColor(input.color) ? input.color.toLowerCase() : SUBJECT_COLORS.includes(input.color) ? input.color : nextColor(),
  };
}

export async function createSubject(input) {
  const store = db();
  const clean = validate(input);
  const id = store.newId(COLLECTION);
  await store.set(COLLECTION, id, {
    ...clean,
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
