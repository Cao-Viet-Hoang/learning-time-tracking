/* Theme preference: "system" | "light" | "dark" (stored locally). */

import { getPrefs, setPref } from "./utils/storage.js";

export function applyTheme(theme = getPrefs().theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
  setPref("theme", theme);
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e0e0d" : "#f6f6f4");
}
