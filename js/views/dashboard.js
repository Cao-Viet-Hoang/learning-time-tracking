/*
 * Today — the primary workspace.
 * Hero progress for the day → central timeline → goal pace for month/year.
 */

import { state } from "../state.js";
import { html, raw, render } from "../utils/dom.js";
import { icon } from "../components/icons.js";
import { progressBar } from "../components/progress.js";
import { badge, emptyState, subjectChip } from "../components/ui.js";
import { dayTimeline, bindTimelineActions } from "../components/timeline.js";
import { reactive, dataReady, loadingView } from "./viewHelpers.js";
import { goalProgress, subjectGoalProgress, PACE_LABEL, PACE_TONE } from "../domain/goals.js";
import { planSummary, nextPlanToday } from "../domain/plans.js";
import { streaks } from "../domain/analytics.js";
import { activeSubjects, getSubject, sessionsOn } from "../domain/selectors.js";
import { colorVar } from "../services/subjects.js";
import { elapsedMs, isRunning } from "../services/timer.js";
import { todayKey, formatDate, formatDuration, formatHours, toDateKey } from "../utils/time.js";
import { pluralize } from "../utils/misc.js";

function greeting() {
  const h = new Date(state.now).getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ---------- Hero ---------- */

function heroSection(today) {
  const day = goalProgress("daily");
  const timerMinutes = state.timer && toDateKey(new Date(state.timer.startedAt)) === today ? Math.floor(elapsedMs() / 60000) : 0;
  const learned = day.actual;
  const plans = planSummary(today, today);
  const sessions = sessionsOn(today);
  const next = nextPlanToday();

  const goalLine = day.target
    ? learned >= day.target
      ? html`<span class="hero__status is-done">${raw(icon("checkCircle", { size: 15 }))}Daily goal reached${learned > day.target ? html` · +${formatDuration(learned - day.target)}` : ""}</span>`
      : html`<span class="hero__status"><strong>${formatDuration(day.remaining)}</strong> to go · ${day.percent}%</span>`
    : html`<button type="button" class="link-btn" data-action="edit-goals" data-focus="daily">${raw(icon("target", { size: 14 }))}Set a daily goal</button>`;

  return html`<section class="hero" aria-labelledby="hero-title">
    <div class="hero__top">
      <div>
        <p class="eyebrow">${greeting()}${state.user ? `, ${state.user.username}` : ""}</p>
        <h1 class="hero__date" id="hero-title">${formatDate(today, "long")}</h1>
      </div>
      <div class="hero__actions">
        <button type="button" class="btn btn--secondary" data-action="log-session">${raw(icon("pencilLine", { size: 14 }))}Log session</button>
        <button type="button" class="btn btn--secondary" data-action="plan-session">${raw(icon("plus", { size: 14 }))}Plan block</button>
        ${
          state.timer
            ? html`<button type="button" class="btn btn--primary" data-timer="expand">${raw(icon("timer", { size: 14 }))}${isRunning() ? "Timer running" : "Timer paused"}</button>`
            : html`<button type="button" class="btn btn--primary" data-action="start-timer">${raw(icon("play", { size: 12 }))}Start focus</button>`
        }
      </div>
    </div>

    <div class="hero__progress">
      <div class="hero__figure">
        <span class="hero__value">${formatDuration(learned)}</span>
        ${day.target ? html`<span class="hero__target">/ ${formatDuration(day.target)}</span>` : ""}
        ${timerMinutes ? html`<span class="hero__live" title="Running timer, saved when you stop">+ <span class="mono" data-timer-clock></span> live</span>` : ""}
      </div>
      ${progressBar({ value: learned, max: day.target || Math.max(learned, 1), tone: day.pace === "done" ? "success" : "accent", size: "lg", label: "Today's progress" })}
      <div class="hero__meta">
        ${goalLine}
        <span class="hero__facts">
          <span>${pluralize(sessions.length, "session")}</span>
          ${plans.total ? html`<span>${formatDuration(plans.actualMinutes)} of ${formatDuration(plans.plannedMinutes)} planned</span>` : ""}
          ${next && !state.timer ? html`<span class="hero__next">Next: <strong>${getSubject(next.plan.subjectId).name}</strong> at ${next.plan.startTime}</span>` : ""}
        </span>
      </div>
    </div>
  </section>`;
}

/* ---------- Timeline ---------- */

function timelineSection(today) {
  const plans = planSummary(today, today);
  return html`<section class="panel panel--timeline" aria-labelledby="tl-title" data-context-date="${today}">
    <header class="panel__head">
      <div>
        <h2 class="panel__title" id="tl-title">Learning timeline</h2>
        <p class="panel__sub">${
          plans.total
            ? `${pluralize(plans.total, "block")} · ${plans.counts.completed} done${plans.counts.missed ? ` · ${plans.counts.missed} missed` : ""}`
            : "Planned blocks and logged sessions, in order"
        }</p>
      </div>
      <div class="panel__actions">
        <a class="btn btn--ghost btn--sm" href="#/planner">${raw(icon("calendar", { size: 14 }))}Open planner</a>
        <button type="button" class="icon-btn" data-action="plan-session" aria-label="Plan a learning block" data-tip="Plan block (P)">${raw(icon("plus", { size: 16 }))}</button>
      </div>
    </header>
    ${dayTimeline(today)}
  </section>`;
}

/* ---------- Goal pace ---------- */

function paceLine(p) {
  if (!p.target) return html`<p class="pace__line is-muted">No goal set</p>`;
  if (p.pace === "done") return html`<p class="pace__line is-success">Goal reached · ${formatHours(p.actual - p.target)} over</p>`;
  const expectedLabel = `Expected by ${formatDate(todayKey())}`;
  const delta = Math.abs(p.delta);
  return html`<p class="pace__line">
    <span class="pace__expected">${expectedLabel} <strong class="mono">${formatHours(p.expected)}</strong></span>
    <span class="pace__delta is-${p.pace}">${p.pace === "on-track" ? "On track" : `${formatHours(delta)} ${p.pace}`}</span>
  </p>`;
}

function paceCard(p, title) {
  return html`<article class="pace">
    <header class="pace__head">
      <h3 class="pace__title">${title}</h3>
      ${p.pace ? badge(PACE_LABEL[p.pace], { tone: PACE_TONE[p.pace] }) : html`<button type="button" class="link-btn link-btn--sm" data-action="edit-goals" data-focus="${p.type}">Set goal</button>`}
    </header>
    <p class="pace__figure"><span class="mono">${formatHours(p.actual)}</span>${p.target ? html`<span class="pace__target"> / ${formatHours(p.target)}</span>` : ""}</p>
    ${progressBar({ value: p.actual, max: p.target || 1, marker: p.target && p.pace !== "done" ? p.expected / p.target : null, tone: p.pace === "behind" ? "warning" : p.pace === "done" ? "success" : "accent", label: `${title} progress` })}
    ${paceLine(p)}
    ${p.target && p.pace !== "done" && p.perDayNeeded ? html`<p class="pace__hint">${formatDuration(p.perDayNeeded)}/day for the remaining ${pluralize(p.remainingDays, "day")}</p>` : ""}
  </article>`;
}

function streakCard() {
  const s = streaks();
  return html`<article class="pace pace--streak">
    <header class="pace__head"><h3 class="pace__title">Streak</h3>${s.current && !s.activeToday ? badge("Learn today to keep it", { tone: "warning" }) : ""}</header>
    <p class="pace__figure"><span class="streak-flame ${s.current ? "is-lit" : ""}" aria-hidden="true">${raw(icon("flame", { size: 20 }))}</span><span class="mono">${s.current}</span><span class="pace__target"> ${s.current === 1 ? "day" : "days"}</span></p>
    <p class="pace__line"><span class="pace__expected">Best <strong class="mono">${pluralize(s.best, "day")}</strong></span></p>
  </article>`;
}

function subjectGoalsStrip() {
  const goals = subjectGoalProgress("monthly");
  if (!goals.length) return "";
  return html`<section class="subject-goals" aria-label="Subject goals this month">
    <h3 class="eyebrow">Subject goals · this month</h3>
    <ul class="subject-goals__list">
      ${goals.map(
        (g) => html`<li class="subject-goal" style="--subject:${colorVar(g.subject.color)}">
          <div class="subject-goal__head">${subjectChip(g.subject, { size: "sm" })}<span class="mono">${formatHours(g.actual)} / ${formatHours(g.target)}</span></div>
          ${progressBar({ value: g.actual, max: g.target, marker: g.pace !== "done" ? g.expected / g.target : null, color: colorVar(g.subject.color), tone: "subject", size: "sm" })}
          <span class="subject-goal__pace is-${g.pace}">${g.pace === "done" ? "Done" : g.pace === "on-track" ? "On track" : `${formatHours(Math.abs(g.delta))} ${g.pace}`}</span>
        </li>`
      )}
    </ul>
  </section>`;
}

/* ---------- View ---------- */

function onboarding() {
  return html`<section class="onboarding">
    ${emptyState({
      title: "Your learning workspace is empty.",
      text: "Create your first subject to start tracking your learning.",
      actionLabel: "Create subject",
      action: "new-subject",
      iconName: "layers",
      secondary: `<a class="btn btn--ghost btn--sm" href="#/settings">${icon("database", { size: 14 })}Load demo data</a>`,
    })}
    <ol class="onboarding__steps">
      <li><span class="mono">01</span><strong>Define subjects</strong><span>The fixed categories you learn — Embedded C, English…</span></li>
      <li><span class="mono">02</span><strong>Set goals</strong><span>Daily, monthly and yearly targets with live pace.</span></li>
      <li><span class="mono">03</span><strong>Plan &amp; track</strong><span>Plan blocks, run the timer, compare planned vs actual.</span></li>
    </ol>
  </section>`;
}

export function mount(el) {
  el.innerHTML = `<div class="view view--dashboard" data-view-root></div>`;
  const root = el.firstElementChild;
  bindTimelineActions(root);

  const stop = reactive(() => {
    if (!dataReady()) return render(root, loadingView("Loading today"));
    const today = todayKey();
    if (!state.data.subjects.length) return render(root, onboarding());

    render(
      root,
      html`${heroSection(today)}
        <div class="dash-grid">
          ${timelineSection(today)}
          <aside class="dash-side" aria-label="Goals and streak">
            ${paceCard(goalProgress("monthly"), "This month")}
            ${paceCard(goalProgress("yearly"), "This year")}
            ${streakCard()}
            ${subjectGoalsStrip()}
            ${
              !activeSubjects().length
                ? html`<div class="notice notice--warning">All subjects are archived. <a href="#/subjects">Restore or create one</a> to plan new learning.</div>`
                : ""
            }
          </aside>
        </div>`
    );
  });
  return stop;
}
