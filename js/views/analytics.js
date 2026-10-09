/*
 * Insights: review (week/month) → activity heatmap → where time goes →
 * consistency → patterns. Everything is computed from stored sessions.
 */

import { state } from "../state.js";
import { html, raw, render } from "../utils/dom.js";
import { icon } from "../components/icons.js";
import { segmented, emptyState, subjectChip, badge } from "../components/ui.js";
import { progressRing } from "../components/progress.js";
import { heatmap } from "../components/heatmap.js";
import { distributionBar, columnChart, hourStrip, weekdayChart } from "../components/charts.js";
import { reactive, dataReady, loadingView } from "./viewHelpers.js";
import { updateParams } from "../router.js";
import { buildReview, shiftAnchor } from "../domain/review.js";
import { subjectDistribution, consistency, streaks, learningPatterns, PATTERN_MIN_SESSIONS, PATTERN_MIN_DAYS } from "../domain/analytics.js";
import { sessionsOn, minutesByDate, firstActivityDate, getSubject } from "../domain/selectors.js";
import { readJSON, writeJSON } from "../utils/storage.js";
import {
  todayKey,
  isDateKey,
  addDays,
  rangeKeys,
  startOfYear,
  formatDate,
  formatDuration,
  formatHourRange,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
  relativeDayLabel,
} from "../utils/time.js";
import { pluralize, percent } from "../utils/misc.js";

const PERIODS = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

function periodBounds(period) {
  const today = todayKey();
  if (period === "30d") return [addDays(today, -29), today];
  if (period === "90d") return [addDays(today, -89), today];
  if (period === "year") return [startOfYear(today), today];
  return [firstActivityDate() || today, today];
}

/* ---------- Review ---------- */

function reviewSection(kind, anchor) {
  const r = buildReview(kind, anchor);
  const changeLabel =
    r.change == null ? "" : `${r.change >= 0 ? "+" : "−"}${Math.abs(Math.round(r.change * 100))}% vs previous ${kind}`;
  const planPct = r.plans.total ? percent(r.plans.counts.completed, r.plans.total - r.plans.counts.skipped) : null;

  // Daily bars for the review range.
  const byDate = minutesByDate();
  const days = rangeKeys(r.from, r.to);
  const bars = days.map((d) => ({
    label: kind === "week" ? WEEKDAYS_SHORT[days.indexOf(d)] : String(Number(d.slice(8))),
    value: d <= todayKey() ? byDate.get(d) || 0 : 0,
    highlight: d === todayKey(),
    tip: `<strong>${formatDate(d, "weekdayDay")}</strong> ${formatDuration(byDate.get(d) || 0)}`,
  }));
  const perDayTarget = r.target.minutes ? Math.round(r.target.minutes / days.length) : 0;

  return html`<section class="panel review" aria-labelledby="review-title">
    <header class="panel__head">
      <div>
        <p class="eyebrow">${kind === "week" ? "Weekly" : "Monthly"} review</p>
        <h2 class="panel__title review__range" id="review-title">${r.label}${r.isCurrent ? html` ${badge("In progress", { tone: "accent" })}` : ""}</h2>
      </div>
      <div class="panel__actions">
        ${segmented("review", [{ value: "week", label: "Week" }, { value: "month", label: "Month" }], kind, { label: "Review period", size: "sm" })}
        <div class="day-nav">
          <button type="button" class="icon-btn icon-btn--sm" data-review-nav="-1" aria-label="Previous ${kind}">${raw(icon("chevronLeft", { size: 15 }))}</button>
          <button type="button" class="icon-btn icon-btn--sm" data-review-nav="1" aria-label="Next ${kind}" ${r.isCurrent ? "disabled" : ""}>${raw(icon("chevronRight", { size: 15 }))}</button>
        </div>
      </div>
    </header>

    <div class="review__body">
      <div class="review__headline">
        ${progressRing({
          value: r.total,
          max: r.target.minutes || Math.max(r.total, 1),
          size: 92,
          stroke: 7,
          tone: r.goalPercent >= 100 ? "success" : "accent",
          label: "Goal completion",
          content: r.goalPercent == null ? "—" : `${r.goalPercent}%`,
        })}
        <div>
          <p class="review__total"><span class="mono">${formatDuration(r.total)}</span> learned</p>
          <p class="review__goal">${r.target.minutes ? html`Goal ${formatDuration(r.target.minutes)} <span class="is-muted">· from ${r.target.basis}</span>` : html`<button type="button" class="link-btn link-btn--sm" data-action="edit-goals">Set a goal</button> to measure completion`}</p>
          ${changeLabel ? html`<p class="review__change ${r.change >= 0 ? "is-up" : "is-down"}">${raw(icon(r.change >= 0 ? "arrowUp" : "arrowDown", { size: 12 }))}${changeLabel}</p>` : ""}
        </div>
      </div>

      <dl class="review__facts">
        <div><dt>Top subject</dt><dd>${r.topSubject ? html`${subjectChip(r.topSubject.subject, { size: "sm" })}<span class="mono is-muted">${formatDuration(r.topSubject.minutes)}</span>` : "—"}</dd></div>
        <div><dt>Sessions</dt><dd class="mono">${r.sessionCount}</dd></div>
        <div><dt>Learning days</dt><dd class="mono">${r.learningDays}<span class="is-muted"> / ${r.daysElapsed}</span></dd></div>
        <div><dt>Planned blocks</dt><dd class="mono">${r.plans.total}</dd></div>
        <div><dt>Completed</dt><dd class="mono">${r.plans.counts.completed}${planPct != null ? html`<span class="is-muted"> · ${planPct}%</span>` : ""}</dd></div>
        <div><dt>Planned vs actual</dt><dd class="mono">${r.plans.plannedMinutes ? `${formatDuration(r.plans.actualMinutes)} / ${formatDuration(r.plans.plannedMinutes)}` : "—"}</dd></div>
      </dl>
    </div>
    ${r.isFuture ? "" : columnChart(bars, { height: 88, reference: perDayTarget, referenceLabel: perDayTarget ? `${formatDuration(perDayTarget)}/day` : "", labelEvery: kind === "week" ? 1 : 5, ariaLabel: "Learning time per day" })}
  </section>`;
}

/* ---------- Heatmap ---------- */

function heatmapSection(selected) {
  const s = streaks();
  const sessions = selected ? sessionsOn(selected) : [];
  return html`<section class="panel" aria-labelledby="heat-title">
    <header class="panel__head">
      <div>
        <h2 class="panel__title" id="heat-title">Learning activity</h2>
        <p class="panel__sub">Last 12 months · click a day for details</p>
      </div>
      <div class="streak-pills">
        <span class="streak-pill ${s.current ? "is-lit" : ""}">${raw(icon("flame", { size: 14 }))}<strong class="mono">${s.current}</strong> day streak</span>
        <span class="streak-pill">Best <strong class="mono">${s.best}</strong></span>
      </div>
    </header>
    ${heatmap({ weeks: 53, selected })}
    ${
      selected
        ? html`<div class="day-peek" aria-live="polite">
            <div class="day-peek__head">
              <strong>${relativeDayLabel(selected)}</strong>
              <span class="mono">${formatDuration(sessions.reduce((t, x) => t + x.durationMinutes, 0))} · ${pluralize(sessions.length, "session")}</span>
              <a class="link-btn link-btn--sm" href="#/planner?date=${selected}">Open in planner</a>
            </div>
            ${
              sessions.length
                ? html`<ul class="day-peek__list">${sessions.map(
                    (x) => html`<li><span class="mono is-muted">${x.startTime}–${x.endTime}</span>${subjectChip(getSubject(x.subjectId), { size: "sm" })}<span>${x.topic}</span><span class="mono">${formatDuration(x.durationMinutes)}</span></li>`
                  )}</ul>`
                : html`<p class="is-muted">No learning logged on this day.</p>`
            }
          </div>`
        : ""
    }
  </section>`;
}

/* ---------- Distribution & consistency ---------- */

function distributionSection(period) {
  const [from, to] = periodBounds(period);
  const d = subjectDistribution(from, to);
  return html`<section class="panel" aria-labelledby="dist-title">
    <header class="panel__head">
      <div><h2 class="panel__title" id="dist-title">Where your time goes</h2><p class="panel__sub">${formatDuration(d.total)} across ${pluralize(d.rows.length, "subject")}</p></div>
    </header>
    ${d.rows.length ? distributionBar(d.rows) : emptyState({ title: "No learning in this period.", compact: true, iconName: "chart" })}
  </section>`;
}

function stat(label, value, sub = "") {
  return html`<div class="stat"><span class="stat-label">${label}</span><span class="stat-value mono">${value}</span>${sub ? html`<span class="stat-sub">${sub}</span>` : ""}</div>`;
}

function consistencySection(period) {
  const [from, to] = periodBounds(period);
  const c = consistency(from, to);
  const s = streaks();
  return html`<section class="panel" aria-labelledby="cons-title">
    <header class="panel__head"><div><h2 class="panel__title" id="cons-title">Consistency</h2><p class="panel__sub">${formatDate(from, "dayYear")} – ${formatDate(to, "dayYear")}</p></div></header>
    <div class="stat-grid">
      ${stat("Learning days", `${c.learningDays}`, `of ${pluralize(c.days, "day")} · ${percent(c.learningDays, c.days)}%`)}
      ${stat("Average per day", formatDuration(c.averagePerDay), `${formatDuration(c.averagePerLearningDay)} on learning days`)}
      ${stat("Daily goal hit", c.goalRate == null ? "—" : `${Math.round(c.goalRate * 100)}%`, c.goalRate == null ? "No daily goal set" : `${c.goalDays} of ${c.days} days ≥ ${formatDuration(c.dailyGoal)}`)}
      ${stat("Current streak", pluralize(s.current, "day"), s.activeToday ? "Including today" : s.current ? "Learn today to extend it" : "Start one today")}
      ${stat("Best streak", pluralize(s.best, "day"))}
      ${stat("Total", formatDuration(c.total))}
    </div>
  </section>`;
}

/* ---------- Patterns ---------- */

function patternsSection(period) {
  const [from, to] = periodBounds(period);
  const sessions = state.data.learningSessions.filter((s) => s.date >= from && s.date <= to);
  const p = learningPatterns(sessions);
  if (!p.enough) {
    return html`<section class="panel" aria-labelledby="pat-title">
      <header class="panel__head"><div><h2 class="panel__title" id="pat-title">Learning patterns</h2></div></header>
      ${emptyState({
        title: "Patterns appear once there's enough data.",
        text: `Log at least ${PATTERN_MIN_SESSIONS} sessions on ${PATTERN_MIN_DAYS} different days in this period (${p.sessionCount} so far).`,
        compact: true,
        iconName: "sparkles",
      })}
    </section>`;
  }
  return html`<section class="panel" aria-labelledby="pat-title">
    <header class="panel__head"><div><h2 class="panel__title" id="pat-title">Learning patterns</h2><p class="panel__sub">From ${pluralize(p.sessionCount, "session")}</p></div></header>
    <div class="insights">
      <div class="insight"><span class="stat-label">Most productive</span><span class="insight__value mono">${p.peakWindow ? formatHourRange(p.peakWindow.start, p.peakWindow.end) : "—"}</span></div>
      <div class="insight"><span class="stat-label">Average session</span><span class="insight__value mono">${formatDuration(p.averageSession)}</span><span class="stat-sub">Longest ${formatDuration(p.longestSession)}</span></div>
      <div class="insight"><span class="stat-label">Most active day</span><span class="insight__value">${p.mostActiveWeekday != null ? WEEKDAYS_LONG[p.mostActiveWeekday] : "—"}</span><span class="stat-sub">Avg ${formatDuration(Math.round(p.weekdayAverage[p.mostActiveWeekday] || 0))}</span></div>
      <div class="insight"><span class="stat-label">Most consistent day</span><span class="insight__value">${p.mostConsistentWeekday != null ? WEEKDAYS_LONG[p.mostConsistentWeekday] : "—"}</span><span class="stat-sub">${Math.round((p.weekdayRate[p.mostConsistentWeekday] || 0) * 100)}% of those days</span></div>
    </div>
    <div class="pattern-charts">
      <div><h3 class="stat-label">Time of day</h3>${hourStrip(p.hours, p.peakWindow)}</div>
      <div><h3 class="stat-label">Average by weekday</h3>${weekdayChart(p.weekdayAverage, p.mostActiveWeekday)}</div>
    </div>
  </section>`;
}

/* ---------- View ---------- */

export function mount(el, params) {
  let reviewKind = params.review === "month" ? "month" : readJSON("insights:review", "week");
  let anchor = isDateKey(params.anchor) ? params.anchor : todayKey();
  let period = PERIODS.some((p) => p.value === params.period) ? params.period : readJSON("insights:period", "90d");
  let selectedDay = null;

  el.innerHTML = `<div class="view view--insights" data-view-root></div>`;
  const root = el.firstElementChild;

  const draw = () => {
    if (!dataReady()) return render(root, loadingView("Loading insights"));
    if (!state.data.learningSessions.length) {
      return render(
        root,
        html`<header class="view-head"><div><p class="eyebrow">Insights</p><h1 class="view-title">Your learning, measured</h1></div></header>
          ${emptyState({
            title: "Insights are built from your sessions.",
            text: "Track a session with the timer or log one manually — progress, streaks and patterns will appear here.",
            actionLabel: state.data.subjects.length ? "Log session" : "Create subject",
            action: state.data.subjects.length ? "log-session" : "new-subject",
            iconName: "chart",
            secondary: `<a class="btn btn--ghost btn--sm" href="#/settings">${icon("database", { size: 14 })}Load demo data</a>`,
          })}`
      );
    }
    render(
      root,
      html`<header class="view-head">
          <div><p class="eyebrow">Insights</p><h1 class="view-title">Your learning, measured</h1></div>
        </header>
        ${reviewSection(reviewKind, anchor)}
        ${heatmapSection(selectedDay)}
        <div class="insights-period">
          <h2 class="insights-period__title">Breakdown</h2>
          ${segmented("period", PERIODS, period, { label: "Analytics period", size: "sm" })}
        </div>
        <div class="insights-grid">
          ${distributionSection(period)}
          ${consistencySection(period)}
        </div>
        ${patternsSection(period)}`
    );
  };

  root.addEventListener("click", (event) => {
    const seg = event.target.closest("[data-seg]");
    if (seg?.dataset.seg === "review") {
      reviewKind = seg.dataset.value;
      anchor = todayKey();
      writeJSON("insights:review", reviewKind);
      updateParams({ review: reviewKind === "week" ? null : reviewKind, anchor: null });
      return draw();
    }
    if (seg?.dataset.seg === "period") {
      period = seg.dataset.value;
      writeJSON("insights:period", period);
      updateParams({ period });
      return draw();
    }
    const nav = event.target.closest("[data-review-nav]");
    if (nav) {
      const next = shiftAnchor(reviewKind, anchor, Number(nav.dataset.reviewNav));
      anchor = next > todayKey() ? todayKey() : next;
      updateParams({ anchor: anchor === todayKey() ? null : anchor });
      return draw();
    }
    const cell = event.target.closest(".hm-cell[data-date]");
    if (cell) {
      selectedDay = selectedDay === cell.dataset.date ? null : cell.dataset.date;
      draw();
      root.querySelector(`.hm-cell[data-date="${cell.dataset.date}"]`)?.focus({ preventScroll: true });
    }
  });

  return reactive(draw, ["data"]);
}

