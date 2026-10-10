/* Helpers shared by views: reactive re-rendering and loading/empty scaffolds. */

import { subscribe, isDataReady } from "../state.js";
import { html } from "../utils/dom.js";
import { skeletonLines } from "../components/ui.js";

/**
 * CSS selector that finds "the same" element after a re-render: its id, or its
 * data-* attributes scoped to the nearest record row (data-plan-id, …).
 */
function focusSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const own = [...el.attributes].filter((a) => a.name.startsWith("data-") && a.name !== "data-tip");
  if (!own.length) return null;
  const selfSel = own.map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join("");
  const row = el.parentElement?.closest("[data-plan-id], [data-session-id], [data-subject-id], [data-date]");
  if (!row) return selfSel;
  const rowAttr = ["data-plan-id", "data-session-id", "data-subject-id", "data-date"].find((n) => row.hasAttribute(n));
  return `[${rowAttr}="${CSS.escape(row.getAttribute(rowAttr))}"] ${selfSel}`;
}

/**
 * Re-runs `draw()` whenever any of the watched state keys change.
 * Preserves focus (and text selection) across re-renders, so typing in a
 * search box or tabbing through buttons isn't interrupted by a live update or
 * the 30s clock tick.
 */
export function reactive(draw, watch = ["data", "timer", "now"]) {
  const run = () => {
    const active = document.activeElement;
    const root = active?.closest("[data-view-root]");
    const selector = root ? focusSelector(active) : null;
    const selection = selector && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
    draw();
    if (selector) {
      let el = null;
      try {
        el = document.querySelector(`[data-view-root] ${selector}`);
      } catch {
        /* selector not valid in this document */
      }
      if (el && el !== document.activeElement) {
        el.focus({ preventScroll: true });
        if (selection && el.setSelectionRange) {
          try {
            el.setSelectionRange(...selection);
          } catch {
            /* not a text input */
          }
        }
      }
    }
  };
  run();
  return subscribe((_, keys) => {
    if (!watch.some((k) => keys.has(k))) return;
    // A clock tick alone shouldn't tear down a view while a menu is anchored to one of its buttons.
    const onlyClock = [...keys].every((k) => k === "now");
    if (onlyClock && document.querySelector(".menu")) return;
    run();
  });
}

export const dataReady = isDataReady;

export function loadingView(title = "Loading") {
  return html`<div class="view-loading" aria-busy="true" aria-label="${title}">
    <div class="skeleton skeleton--title"></div>
    ${skeletonLines(4, { heights: [56, 14, 14, 120] })}
  </div>`;
}
