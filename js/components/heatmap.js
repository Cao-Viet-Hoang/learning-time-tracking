/*
 * GitHub-style activity heatmap (weeks as columns, Mon–Sun rows).
 * Single-hue sequential scale; each cell is a focusable button with a tooltip.
 */

import { html, raw, esc } from "../utils/dom.js";
import { minutesByDate, sessionsOn } from "../domain/selectors.js";
import { heatLevel } from "../domain/analytics.js";
import { findGoal } from "../services/goals.js";
import { todayKey, addDays, startOfWeek, formatDate, formatDuration, diffDays, parseDateKey } from "../utils/time.js";
import { pluralize } from "../utils/misc.js";

const ROW_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function cellTip(date, minutes, count) {
  return esc(
    `<strong>${formatDate(date, "weekdayDay")}</strong><span class="tip-row"><span>Learning time</span><b>${minutes ? formatDuration(minutes) : "—"}</b></span><span class="tip-row"><span>Sessions</span><b>${count}</b></span>`
  );
}

/**
 * heatmap({ weeks, end, selected }) — `end` defaults to today.
 */
export function heatmap({ weeks = 53, end = todayKey(), selected = null } = {}) {
  const byDate = minutesByDate();
  const reference = findGoal("daily")?.targetMinutes || 120;
  const lastWeekStart = startOfWeek(end);
  const start = addDays(lastWeekStart, -(weeks - 1) * 7);
  const today = todayKey();

  const columns = [];
  const monthLabels = [];
  let lastMonth = null;
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(start, w * 7);
    const month = parseDateKey(weekStart).getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ col: w, label: formatDate(weekStart, "monthShort") });
      lastMonth = month;
    }
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);
      if (date > end) {
        cells.push(`<span class="hm-cell is-future" aria-hidden="true"></span>`);
        continue;
      }
      const minutes = byDate.get(date) || 0;
      const count = minutes ? sessionsOn(date).length : 0;
      const level = heatLevel(minutes, reference);
      cells.push(
        `<button type="button" class="hm-cell" data-level="${level}" data-date="${date}" ${date === today ? 'data-today="1"' : ""} ${date === selected ? 'aria-pressed="true"' : ""}
          data-tip-html="${cellTip(date, minutes, count)}" aria-label="${formatDate(date, "weekdayDay")}: ${minutes ? formatDuration(minutes) : "no learning"}, ${pluralize(count, "session")}"></button>`
      );
    }
    columns.push(`<div class="hm-col">${cells.join("")}</div>`);
  }

  // Drop a month label that would collide with the next one.
  const labels = monthLabels.filter((m, i) => !monthLabels[i + 1] || monthLabels[i + 1].col - m.col >= 3);

  return html`<div class="heatmap" style="--weeks:${weeks}">
    <div class="heatmap__scroll">
      <div class="heatmap__inner">
        <div class="heatmap__months" aria-hidden="true">
          ${labels.map((m) => html`<span style="grid-column:${m.col + 1}">${m.label}</span>`)}
        </div>
        <div class="heatmap__body">
          <div class="heatmap__rows" aria-hidden="true">${ROW_LABELS.map((l) => html`<span>${l}</span>`)}</div>
          <div class="heatmap__grid" role="group" aria-label="Daily learning activity">${raw(columns.join(""))}</div>
        </div>
      </div>
    </div>
    <div class="heatmap__legend">
      <span>Less</span>
      ${[0, 1, 2, 3, 4].map((l) => html`<span class="hm-cell hm-cell--legend" data-level="${l}" aria-hidden="true"></span>`)}
      <span>More</span>
      <span class="heatmap__ref">Full shade = ${formatDuration(reference)}${findGoal("daily") ? " (daily goal)" : ""}</span>
    </div>
  </div>`;
}

export const heatmapSpanDays = (weeks) => diffDays(addDays(startOfWeek(todayKey()), -(weeks - 1) * 7), todayKey()) + 1;
