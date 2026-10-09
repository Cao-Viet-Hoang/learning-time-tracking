/* Progress bar & ring templates. Width/dash animate via CSS transitions. */

import { clamp } from "../utils/misc.js";
import { raw, esc } from "../utils/dom.js";

/**
 * Linear progress. `marker` (0–1) draws a tick for the "expected by today" point.
 * tone: accent | success | warning | danger | subject color css value via `color`
 */
export function progressBar({ value = 0, max = 1, marker = null, tone = "accent", color = "", size = "md", label = "" } = {}) {
  const ratio = max ? clamp(value / max, 0, 1) : 0;
  const pct = Math.round(ratio * 1000) / 10;
  const markerPct = marker == null ? null : clamp(marker, 0, 1) * 100;
  const style = color ? `--bar-color:${color};` : "";
  return raw(`
    <div class="progress progress--${size} progress--${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="100"
         aria-valuenow="${Math.round(ratio * 100)}" ${label ? `aria-label="${esc(label)}"` : ""} style="${style}">
      <div class="progress__fill" style="--progress:${pct}%"></div>
      ${markerPct == null ? "" : `<div class="progress__marker" style="left:${markerPct}%" title="Expected by today"></div>`}
    </div>`);
}

/** Circular progress ring rendered in SVG. */
export function progressRing({ value = 0, max = 1, size = 44, stroke = 4, tone = "accent", color = "", label = "", content = "" } = {}) {
  const ratio = max ? clamp(value / max, 0, 1) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - ratio);
  return raw(`
    <div class="ring ring--${tone}" style="width:${size}px;height:${size}px;${color ? `--ring-color:${color};` : ""}"
         role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}" ${label ? `aria-label="${esc(label)}"` : ""}>
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>
        <circle class="ring__value" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"
                stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round"
                transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      ${content ? `<span class="ring__content">${esc(content)}</span>` : ""}
    </div>`);
}
