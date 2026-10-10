/*
 * Planner: a week strip + month calendar for orientation, and a day canvas
 * where blocks are laid out on an hour grid. Clicking an empty slot plans a
 * block at that time — planning feels like drawing on a timeline.
 */

import { state } from "../state.js";
import { html, raw, render, esc } from "../utils/dom.js";
import { icon } from "../components/icons.js";
import { segmented, badge, subjectChip } from "../components/ui.js";
import { dayTimeline, bindTimelineActions, planMenuItems } from "../components/timeline.js";
import { openMenu } from "../components/dropdown.js";
import { reactive, dataReady, loadingView } from "./viewHelpers.js";
import { updateParams } from "../router.js";
import { plansOn, sessionsOn, minutesOn, getSubject } from "../domain/selectors.js";
import { evaluateDay, planSummary, PLAN_STATUS_META } from "../domain/plans.js";
import { colorVar, inkFor } from "../services/subjects.js";
import { openPlanForm } from "../forms/planForm.js";
import { readJSON, writeJSON } from "../utils/storage.js";
import {
  todayKey,
  isDateKey,
  addDays,
  addMonths,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  rangeKeys,
  formatDate,
  formatDuration,
  relativeDayLabel,
  timeToMinutes,
  minutesToTime,
  nowMinutes,
  WEEKDAYS_SHORT,
} from "../utils/time.js";
import { pluralize } from "../utils/misc.js";

const HOUR_PX = 56;
const DEFAULT_RANGE = [7, 23];

/* ---------- Calendar ---------- */

function dayDots(date) {
  const evaluated = evaluateDay(date);
  if (!evaluated.length) return "";
  return html`<span class="cal__dots" aria-hidden="true">${evaluated.slice(0, 4).map((e) => html`<i class="is-${e.status}" style="--subject:${colorVar(getSubject(e.plan.subjectId).color)}"></i>`)}</span>`;
}

function monthCalendar(selected) {
  const today = todayKey();
  const first = startOfMonth(selected);
  const last = endOfMonth(selected);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const days = rangeKeys(gridStart, gridEnd);

  return html`<div class="cal">
    <div class="cal__head">
      <button type="button" class="icon-btn icon-btn--sm" data-nav="month-prev" aria-label="Previous month">${raw(icon("chevronLeft", { size: 15 }))}</button>
      <h3 class="cal__title">${formatDate(first, "month")}</h3>
      <button type="button" class="icon-btn icon-btn--sm" data-nav="month-next" aria-label="Next month">${raw(icon("chevronRight", { size: 15 }))}</button>
    </div>
    <div class="cal__grid" role="grid" aria-label="${formatDate(first, "month")}">
      ${WEEKDAYS_SHORT.map((d) => html`<span class="cal__dow" role="columnheader">${d.slice(0, 2)}</span>`)}
      ${days.map((d) => {
        const minutes = minutesOn(d);
        const plans = plansOn(d).length;
        return html`<button type="button" role="gridcell" class="cal__day ${d.slice(0, 7) !== first.slice(0, 7) ? "is-outside" : ""} ${d === today ? "is-today" : ""} ${d === selected ? "is-selected" : ""}"
          data-date="${d}" aria-label="${formatDate(d, "weekdayDay")}: ${pluralize(plans, "plan")}, ${minutes ? formatDuration(minutes) : "no learning"}" ${d === selected ? raw('aria-current="date"') : ""}>
          <span class="cal__num">${Number(d.slice(8))}</span>
          ${dayDots(d)}
          ${minutes ? html`<span class="cal__min" aria-hidden="true">${formatDuration(minutes)}</span>` : ""}
        </button>`;
      })}
    </div>
    <div class="cal__legend" aria-hidden="true">
      <span><i class="is-completed"></i>Done</span><span><i class="is-partial"></i>Partial</span><span><i class="is-missed"></i>Missed</span><span><i class="is-upcoming"></i>Planned</span>
    </div>
  </div>`;
}

function weekStrip(selected) {
  const start = startOfWeek(selected);
  const today = todayKey();
  return html`<div class="week-strip" role="tablist" aria-label="Week">
    ${rangeKeys(start, addDays(start, 6)).map((d) => {
      const plans = plansOn(d);
      const minutes = minutesOn(d);
      return html`<button type="button" role="tab" class="week-strip__day ${d === selected ? "is-selected" : ""} ${d === today ? "is-today" : ""}" data-date="${d}" aria-selected="${d === selected}">
        <span class="week-strip__dow">${formatDate(d, "weekdayShort")}</span>
        <span class="week-strip__num">${Number(d.slice(8))}</span>
        <span class="week-strip__meta">${plans.length ? pluralize(plans.length, "block") : minutes ? formatDuration(minutes) : "—"}</span>
      </button>`;
    })}
  </div>`;
}

/* ---------- Day canvas (hour grid) ---------- */

/** Assigns overlapping blocks to side-by-side lanes. */
function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const lanes = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const count = Math.max(...group.map((i) => i.lane + 1));
    group.forEach((i) => (i.lanes = count));
    group = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd && group.length) {
      flush();
      lanes.length = 0;
    }
    let lane = lanes.findIndex((end) => end <= item.start);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = item.end;
    item.lane = lane;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) flush();
  return sorted;
}

function dayCanvas(date) {
  const evaluated = evaluateDay(date);
  const sessions = sessionsOn(date);
  const starts = [...evaluated.map((e) => timeToMinutes(e.plan.startTime)), ...sessions.map((s) => timeToMinutes(s.startTime))];
  const ends = [...evaluated.map((e) => timeToMinutes(e.plan.endTime)), ...sessions.map((s) => timeToMinutes(s.startTime) + s.durationMinutes)];
  const fromHour = Math.min(DEFAULT_RANGE[0], ...starts.map((m) => Math.floor(m / 60)));
  const toHour = Math.max(DEFAULT_RANGE[1], ...ends.map((m) => Math.ceil(m / 60)));
  const hours = rangeHours(fromHour, Math.min(24, toHour));
  const top = (min) => ((min - fromHour * 60) / 60) * HOUR_PX;

  const planBlocks = layoutLanes(evaluated.map((e) => ({ e, start: timeToMinutes(e.plan.startTime), end: timeToMinutes(e.plan.endTime) })));
  const sessionBlocks = layoutLanes(sessions.map((s) => ({ s, start: timeToMinutes(s.startTime), end: timeToMinutes(s.startTime) + s.durationMinutes })));

  const isToday = date === todayKey();
  const now = nowMinutes(new Date(state.now));

  return html`<div class="canvas" style="--hour:${HOUR_PX}px;height:${hours.length * HOUR_PX}px" data-from-hour="${fromHour}">
    <div class="canvas__hours" aria-hidden="true">${hours.map((h) => html`<span style="top:${(h - fromHour) * HOUR_PX}px">${String(h).padStart(2, "0")}:00</span>`)}</div>
    <div class="canvas__lanes">
      <div class="canvas__col canvas__col--plan" data-slot-col>
        <span class="canvas__col-label">Plan</span>
        ${hours.map((h) => html`<button type="button" class="canvas__slot" style="top:${(h - fromHour) * HOUR_PX}px" data-slot="${minutesToTime(h * 60)}" aria-label="Plan a block at ${String(h).padStart(2, "0")}:00" tabindex="-1"></button>`)}
        ${planBlocks.map(({ e, start, end, lane, lanes }) => {
          const subject = getSubject(e.plan.subjectId);
          const height = Math.max(22, top(end) - top(start) - 3);
          return html`<div class="block block--plan is-${e.status} ${height < 44 ? "is-short" : ""}" data-plan-id="${e.plan.id}"
              style="top:${top(start)}px;height:${height}px;left:calc(${(lane / lanes) * 100}% + 2px);width:calc(${100 / lanes}% - 4px);--subject:${colorVar(subject.color)}">
            <button type="button" class="block__body" data-plan-action="edit" aria-label="Edit ${esc(subject.name)} ${e.plan.startTime}–${e.plan.endTime}, ${PLAN_STATUS_META[e.status].label}">
              <span class="block__time mono">${e.plan.startTime}–${e.plan.endTime}</span>
              <span class="block__title">${subject.name}</span>
              ${e.plan.topic ? html`<span class="block__topic">${e.plan.topic}</span>` : ""}
            </button>
            <span class="block__status">${e.actual ? `${e.completion}%` : ""}</span>
            <button type="button" class="block__menu icon-btn icon-btn--xs" data-block-menu aria-label="Actions" aria-haspopup="menu">${raw(icon("more", { size: 13 }))}</button>
          </div>`;
        })}
      </div>
      <div class="canvas__col canvas__col--actual">
        <span class="canvas__col-label">Actual</span>
        ${sessionBlocks.map(({ s, start, end, lane, lanes }) => {
          const subject = getSubject(s.subjectId);
          return html`<button type="button" class="block block--session" data-session-id="${s.id}" data-session-action="edit"
              style="top:${top(start)}px;height:${Math.max(16, top(end) - top(start) - 3)}px;left:calc(${(lane / lanes) * 100}% + 2px);width:calc(${100 / lanes}% - 4px);--subject:${colorVar(subject.color)};--subject-ink:${inkFor(subject.color)}"
              data-tip="${subject.name}${s.topic ? ` · ${s.topic}` : ""} · ${formatDuration(s.durationMinutes)}" aria-label="Logged ${esc(subject.name)} ${s.startTime}–${s.endTime}">
            <span class="block__time mono">${formatDuration(s.durationMinutes)}</span>
          </button>`;
        })}
      </div>
      <div class="canvas__grid" aria-hidden="true">${hours.map((h) => html`<span style="top:${(h - fromHour) * HOUR_PX}px"></span>`)}</div>
      ${isToday && now >= fromHour * 60 && now <= hours.length * 60 + fromHour * 60 ? html`<div class="canvas__now" style="top:${top(now)}px" aria-hidden="true"><span class="mono">${minutesToTime(now)}</span></div>` : ""}
    </div>
  </div>`;
}

function rangeHours(from, to) {
  const out = [];
  for (let h = from; h < to; h++) out.push(h);
  return out;
}

/* ---------- Day summary ---------- */

function daySummary(date) {
  const s = planSummary(date, date);
  const logged = minutesOn(date);
  const pct = s.plannedMinutes ? Math.round((s.actualMinutes / s.plannedMinutes) * 100) : null;
  return html`<div class="day-summary">
    <div class="day-summary__item"><span class="day-summary__label">Planned</span><span class="day-summary__value mono">${formatDuration(s.plannedMinutes)}</span></div>
    <div class="day-summary__item"><span class="day-summary__label">Actual (in plan)</span><span class="day-summary__value mono">${formatDuration(s.actualMinutes)}</span></div>
    <div class="day-summary__item"><span class="day-summary__label">Completion</span><span class="day-summary__value mono">${pct == null ? "—" : `${pct}%`}</span></div>
    <div class="day-summary__item"><span class="day-summary__label">Total learned</span><span class="day-summary__value mono">${formatDuration(logged)}</span></div>
  </div>`;
}

/** Planned vs actual detail table for the selected day. */
function comparisonTable(date) {
  const evaluated = evaluateDay(date);
  if (!evaluated.length) return "";
  return html`<details class="disclosure" ${readJSON("planner:compareOpen", false) ? raw("open") : ""} data-remember="planner:compareOpen">
    <summary class="disclosure__summary">${raw(icon("chevronRight", { size: 14 }))}Planned vs actual</summary>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th scope="col">Block</th><th scope="col">Subject</th><th scope="col" class="num">Planned</th><th scope="col" class="num">Actual</th><th scope="col" class="num">Completion</th><th scope="col">State</th></tr></thead>
        <tbody>
          ${evaluated.map((e) => {
            const meta = PLAN_STATUS_META[e.status];
            return html`<tr>
              <td class="mono">${e.plan.startTime}–${e.plan.endTime}</td>
              <td>${subjectChip(getSubject(e.plan.subjectId), { size: "sm" })}${e.plan.topic ? html`<span class="table__sub">${e.plan.topic}</span>` : ""}</td>
              <td class="num mono">${formatDuration(e.planned)}</td>
              <td class="num mono">${formatDuration(e.actual)}</td>
              <td class="num mono">${e.completion}%</td>
              <td>${badge(meta.short || meta.label, { tone: meta.tone, iconName: meta.icon })}</td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
  </details>`;
}

/* ---------- View ---------- */

export function mount(el, params) {
  let date = isDateKey(params.date) ? params.date : todayKey();
  let mode = params.mode === "list" || params.mode === "canvas" ? params.mode : readJSON("planner:mode", "canvas");

  el.innerHTML = `<div class="view view--planner" data-view-root></div>`;
  const root = el.firstElementChild;
  bindTimelineActions(root);

  const draw = () => {
    if (!dataReady()) return render(root, loadingView("Loading planner"));
    const isPast = date < todayKey();
    render(
      root,
      html`<header class="view-head">
          <div>
            <p class="eyebrow">Planner</p>
            <h1 class="view-title">${relativeDayLabel(date)}${relativeDayLabel(date).match(/^(Today|Yesterday|Tomorrow)$/) ? html`<span class="view-title__sub">${formatDate(date, "longYear")}</span>` : ""}</h1>
          </div>
          <div class="view-head__actions">
            <div class="day-nav">
              <button type="button" class="icon-btn" data-nav="prev" aria-label="Previous day" data-tip="Previous day (←)">${raw(icon("chevronLeft", { size: 16 }))}</button>
              <button type="button" class="btn btn--ghost btn--sm" data-nav="today" ${date === todayKey() ? "disabled" : ""}>Today</button>
              <button type="button" class="icon-btn" data-nav="next" aria-label="Next day" data-tip="Next day (→)">${raw(icon("chevronRight", { size: 16 }))}</button>
              <label class="sr-only" for="planner-date">Jump to date</label>
              <input type="date" id="planner-date" class="input input--sm day-nav__picker" value="${date}">
            </div>
            ${segmented("mode", [{ value: "canvas", label: "Day grid" }, { value: "list", label: "Timeline" }], mode, { label: "Planner layout", size: "sm" })}
            <button type="button" class="btn btn--primary" data-action="plan-session">${raw(icon("plus", { size: 14 }))}Plan block</button>
          </div>
        </header>
        ${weekStrip(date)}
        <div class="planner-grid" data-context-date="${date}">
          <section class="panel panel--day" aria-label="Plan for ${formatDate(date, "weekdayDay")}">
            ${daySummary(date)}
            ${mode === "canvas" ? dayCanvas(date) : dayTimeline(date)}
            ${comparisonTable(date)}
            <div class="day-footer">
              <button type="button" class="btn btn--ghost btn--sm" data-action="copy-yesterday">${raw(icon("copy", { size: 14 }))}Copy plans from previous day</button>
              ${!isPast || date === todayKey() ? "" : html`<button type="button" class="btn btn--ghost btn--sm" data-action="log-session">${raw(icon("pencilLine", { size: 14 }))}Log a session on this day</button>`}
            </div>
          </section>
          <aside class="planner-side">${monthCalendar(date)}</aside>
        </div>`
    );
  };

  const setDate = (next) => {
    if (!isDateKey(next) || next === date) return;
    date = next;
    updateParams({ date: date === todayKey() ? null : date });
    draw();
  };

  root.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      const n = nav.dataset.nav;
      if (n === "prev") setDate(addDays(date, -1));
      else if (n === "next") setDate(addDays(date, 1));
      else if (n === "today") setDate(todayKey());
      else if (n === "month-prev") setDate(addMonths(date, -1));
      else if (n === "month-next") setDate(addMonths(date, 1));
      return;
    }
    const day = event.target.closest(".cal__day, .week-strip__day");
    if (day) return setDate(day.dataset.date);

    const seg = event.target.closest("[data-seg='mode']");
    if (seg) {
      mode = seg.dataset.value;
      writeJSON("planner:mode", mode);
      draw();
      return;
    }
    const slot = event.target.closest("[data-slot]");
    if (slot) return openPlanForm({ date, startTime: slot.dataset.slot });

    const blockMenu = event.target.closest("[data-block-menu]");
    if (blockMenu) {
      const plan = state.data.plannedSessions.find((p) => p.id === blockMenu.closest("[data-plan-id]").dataset.planId);
      if (plan) openMenu(blockMenu, planMenuItems(plan), { label: "Plan actions" });
    }
  });

  // Click on empty canvas area → plan at the nearest quarter hour.
  root.addEventListener("dblclick", (event) => {
    const col = event.target.closest("[data-slot-col]");
    if (!col || event.target.closest(".block")) return;
    const canvas = col.closest(".canvas");
    const rect = col.getBoundingClientRect();
    const fromHour = Number(canvas.dataset.fromHour);
    const minutes = Math.round(((event.clientY - rect.top) / HOUR_PX) * 4) * 15 + fromHour * 60;
    openPlanForm({ date, startTime: minutesToTime(Math.min(minutes, 23 * 60 + 45)) });
  });

  root.addEventListener("change", (event) => {
    if (event.target.id === "planner-date") setDate(event.target.value);
  });
  root.addEventListener("toggle", (event) => {
    const d = event.target.closest?.("[data-remember]");
    if (d) writeJSON(d.dataset.remember, d.open);
  }, true);

  const onKey = (event) => {
    if (event.target.closest("input, textarea, select, dialog") || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowLeft") setDate(addDays(date, -1));
    else if (event.key === "ArrowRight") setDate(addDays(date, 1));
  };
  document.addEventListener("keydown", onKey);

  const stop = reactive(draw);
  const unmount = () => {
    stop();
    document.removeEventListener("keydown", onKey);
  };
  unmount.update = (p) => {
    const next = isDateKey(p.date) ? p.date : todayKey();
    if (next !== date) {
      date = next;
      draw();
    }
  };
  return unmount;
}

