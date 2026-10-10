/*
 * Lightweight HTML/SVG charts. Text always uses ink tokens; color marks carry
 * subject identity. Every mark has a tooltip; values are directly labelled.
 */

import { html, raw, esc } from "../utils/dom.js";
import { colorVar } from "../services/subjects.js";
import { formatDuration, formatDate, WEEKDAYS_SHORT, pad2 } from "../utils/time.js";
import { subjectChip } from "./ui.js";

/** Horizontal stacked share bar + ranked legend list. rows: [{ subject, minutes, share }] */
export function distributionBar(rows, { maxSegments = 6 } = {}) {
  const top = rows.slice(0, maxSegments);
  const rest = rows.slice(maxSegments);
  const restMinutes = rest.reduce((t, r) => t + r.minutes, 0);
  const restShare = rest.reduce((t, r) => t + r.share, 0);
  const segments = [...top.map((r) => ({ ...r, color: colorVar(r.subject.color), name: r.subject.name }))];
  if (rest.length) segments.push({ name: `Other (${rest.length})`, minutes: restMinutes, share: restShare, color: "var(--text-muted)", other: true });

  return html`<div class="dist">
    <div class="dist__bar" role="img" aria-label="Share of learning time by subject">
      ${segments.map(
        (s) =>
          html`<span class="dist__seg" style="flex-grow:${Math.max(s.share, 0.004)};--seg:${s.color}"
            data-tip-html="${raw(esc(`<strong>${esc(s.name)}</strong><span class="tip-row"><span>${formatDuration(s.minutes)}</span><b>${Math.round(s.share * 100)}%</b></span>`))}"></span>`
      )}
    </div>
    <ol class="dist__list">
      ${segments.map(
        (s, i) => html`<li class="dist__row">
          <span class="dist__rank mono">${i + 1}</span>
          ${s.other ? html`<span class="subject-chip"><span class="subject-chip__dot" style="--subject:${s.color}"></span><span class="subject-chip__name">${s.name}</span></span>` : subjectChip(top[i].subject)}
          <span class="dist__track" aria-hidden="true"><span style="width:${(s.share / segments[0].share) * 100}%;--seg:${s.color}"></span></span>
          <span class="dist__value mono">${formatDuration(s.minutes)}</span>
          <span class="dist__pct mono">${Math.round(s.share * 100)}%</span>
        </li>`
      )}
    </ol>
  </div>`;
}

/**
 * Vertical column chart. items: [{ label, value, tip, highlight }]
 * Optional `reference` draws a dashed goal line.
 */
export function columnChart(items, { height = 120, reference = 0, referenceLabel = "", format = formatDuration, labelEvery = 1, ariaLabel = "Chart" } = {}) {
  const max = Math.max(reference, ...items.map((i) => i.value), 1);
  const refPct = reference ? (reference / max) * 100 : null;
  return html`<div class="cols" style="--h:${height}px" role="img" aria-label="${ariaLabel}">
    <div class="cols__plot">
      ${refPct != null ? html`<div class="cols__ref" style="bottom:${refPct}%"><span>${referenceLabel || format(reference)}</span></div>` : ""}
      ${items.map(
        (item) => html`<div class="cols__col ${item.highlight ? "is-highlight" : ""}" data-tip-html="${raw(esc(item.tip || `<strong>${esc(item.label)}</strong> ${format(item.value)}`))}">
          <span class="cols__bar ${item.value ? "" : "is-zero"}" style="height:${(item.value / max) * 100}%"></span>
        </div>`
      )}
    </div>
    <div class="cols__axis" aria-hidden="true">
      ${items.map((item, i) => html`<span>${i % labelEvery === 0 ? item.label : ""}</span>`)}
    </div>
  </div>`;
}

/** 24-hour activity strip (minutes per hour). */
export function hourStrip(hours, peak) {
  const max = Math.max(...hours, 1);
  return html`<div class="hours" role="img" aria-label="Learning time by hour of day">
    <div class="hours__bars">
      ${hours.map(
        (m, h) =>
          html`<span class="hours__bar ${peak && h >= peak.start && h < peak.end ? "is-peak" : ""}" style="height:${Math.max(m ? 6 : 2, (m / max) * 100)}%"
            data-tip-html="${raw(esc(`<strong>${pad2(h)}:00 – ${pad2((h + 1) % 24)}:00</strong> ${formatDuration(m)}`))}"></span>`
      )}
    </div>
    <div class="hours__axis" aria-hidden="true">${[0, 6, 12, 18, 24].map((h) => html`<span>${pad2(h % 24)}${h === 24 ? "" : ""}</span>`)}</div>
  </div>`;
}

/** Weekday averages Mon–Sun. */
export function weekdayChart(values, best) {
  return columnChart(
    values.map((v, i) => ({
      label: WEEKDAYS_SHORT[i],
      value: Math.round(v),
      highlight: i === best,
      tip: `<strong>${WEEKDAYS_SHORT[i]}</strong> avg ${formatDuration(Math.round(v))}`,
    })),
    { height: 96, ariaLabel: "Average learning time by weekday" }
  );
}

/** Tiny inline sparkline (bars) for subject cards. series: [{ date, minutes }] */
export function sparkBars(series, color) {
  const max = Math.max(...series.map((s) => s.minutes), 1);
  return raw(`<div class="spark" style="--seg:${color}" aria-hidden="true">${series
    .map((s) => `<span style="height:${s.minutes ? Math.max(12, (s.minutes / max) * 100) : 4}%" class="${s.minutes ? "" : "is-zero"}" title="${formatDate(s.date)}: ${formatDuration(s.minutes)}"></span>`)
    .join("")}</div>`);
}
