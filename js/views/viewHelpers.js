/* Helpers shared by views: reactive re-rendering and loading/empty scaffolds. */

import { subscribe, isDataReady } from "../state.js";
import { html } from "../utils/dom.js";
import { skeletonLines } from "../components/ui.js";

/**
 * Re-runs `draw()` whenever any of the watched state keys change.
 * Preserves focus on elements with an id across re-renders, so typing in a
 * search box isn't interrupted by a live Firestore update.
 */
export function reactive(draw, watch = ["data", "timer", "now"]) {
  const run = () => {
    const active = document.activeElement;
    const focusId = active?.id && active.closest("[data-view-root]") ? active.id : null;
    const selection = focusId && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
    draw();
    if (focusId) {
      const el = document.getElementById(focusId);
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
    if (watch.some((k) => keys.has(k))) run();
  });
}

export const dataReady = isDataReady;

export function loadingView(title = "Loading") {
  return html`<div class="view-loading" aria-busy="true" aria-label="${title}">
    <div class="skeleton skeleton--title"></div>
    ${skeletonLines(4, { heights: [56, 14, 14, 120] })}
  </div>`;
}
