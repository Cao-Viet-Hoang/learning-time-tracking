/*
 * Day timeline: merges planned blocks, logged sessions that weren't part of a
 * plan, the active timer and a "now" marker into one chronological rail.
 * Also owns the shared actions for plan blocks (used by dashboard & planner).
 */

import { state } from "../state.js";
import { html, raw, esc } from "../utils/dom.js";
import { icon } from "./icons.js";
import { badge, subjectChip, emptyState } from "./ui.js";
import { openMenu } from "./dropdown.js";
import { confirmDialog } from "./modal.js";
import { toast, toastSuccess, toastError } from "./toast.js";
import { quickStart, openFocusTimer } from "./timer.js";
import { colorVar } from "../services/subjects.js";
import { getSubject, sessionsOn } from "../domain/selectors.js";
import { evaluateDay, PLAN_STATUS_META } from "../domain/plans.js";
import { setPlanStatus, deletePlannedSession, duplicatePlannedSession, restorePlannedSession } from "../services/plannedSessions.js";
import { elapsedMs } from "../services/timer.js";
import { openPlanForm } from "../forms/planForm.js";
import { openSessionForm } from "../forms/sessionForm.js";
import { todayKey, toTimeString, toDateKey, formatDuration, formatClock, timeToMinutes, addDays, relativeDayLabel } from "../utils/time.js";

/* ---------- Items ---------- */

function statusBadge(status) {
  const meta = PLAN_STATUS_META[status];
  return badge(meta.short || meta.label, { tone: meta.tone, iconName: meta.icon, title: meta.label });
}

function planItem(e, { compact = false } = {}) {
  const { plan, status, planned, actual } = e;
  const subject = getSubject(plan.subjectId);
  const canStart = !state.timer && !subject.archived && plan.date === todayKey() && ["now", "upcoming", "missed", "in-progress", "partial"].includes(status);
  const showProgress = actual > 0 || ["completed", "partial", "missed"].includes(status);
  const barTone = status === "completed" ? "success" : status === "partial" ? "warning" : "accent";

  return html`<li class="tl-item tl-item--plan is-${status}" style="--subject:${colorVar(subject.color)}" data-plan-id="${plan.id}">
    <div class="tl-item__time mono">
      <span>${plan.startTime}</span>
      <span class="tl-item__end">${plan.endTime}</span>
    </div>
    <div class="tl-item__node" aria-hidden="true">${status === "completed" ? raw(icon("check", { size: 10, strokeWidth: 3 })) : ""}</div>
    <div class="tl-item__card">
      <div class="tl-item__head">
        ${subjectChip(subject)}
        ${statusBadge(status)}
      </div>
      ${plan.topic ? html`<p class="tl-item__topic">${plan.topic}</p>` : html`<p class="tl-item__topic is-empty">No topic</p>`}
      ${!compact && plan.note ? html`<p class="tl-item__note">${plan.note}</p>` : ""}
      <div class="tl-item__foot">
        <span class="tl-item__meta">
          ${showProgress ? html`<span class="mono">${formatDuration(actual)}</span> / ` : ""}${formatDuration(planned)}${showProgress ? html` · ${e.completion}%` : " planned"}
        </span>
        ${
          showProgress
            ? html`<span class="mini-bar mini-bar--${barTone}" aria-hidden="true"><span style="width:${Math.min(100, e.completion)}%"></span></span>`
            : ""
        }
      </div>
      <div class="tl-item__actions">
        ${
          status === "active"
            ? html`<button type="button" class="btn btn--sm btn--secondary" data-plan-action="open-timer">${raw(icon("timer", { size: 13 }))}Open timer</button>`
            : ""
        }
        ${canStart ? html`<button type="button" class="btn btn--sm btn--primary" data-plan-action="start">${raw(icon("play", { size: 11 }))}Start</button>` : ""}
        ${
          !["completed", "skipped", "active"].includes(status)
            ? html`<button type="button" class="btn btn--sm btn--ghost" data-plan-action="complete">${raw(icon("check", { size: 13 }))}Done</button>`
            : ""
        }
        <button type="button" class="icon-btn icon-btn--sm" data-plan-action="menu" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${esc(subject.name)} ${plan.startTime}">
          ${raw(icon("more", { size: 15 }))}
        </button>
      </div>
    </div>
  </li>`;
}

function sessionItem(session) {
  const subject = getSubject(session.subjectId);
  return html`<li class="tl-item tl-item--session" style="--subject:${colorVar(subject.color)}" data-session-id="${session.id}">
    <div class="tl-item__time mono">
      <span>${session.startTime}</span>
      <span class="tl-item__end">${session.endTime}</span>
    </div>
    <div class="tl-item__node" aria-hidden="true"></div>
    <div class="tl-item__card">
      <div class="tl-item__head">
        ${subjectChip(subject)}
        ${badge("Logged", { tone: "success", iconName: session.source === "timer" ? "timer" : "pencilLine", title: session.source === "timer" ? "Tracked with timer" : "Logged manually" })}
      </div>
      ${session.topic ? html`<p class="tl-item__topic">${session.topic}</p>` : ""}
      <div class="tl-item__foot"><span class="tl-item__meta"><span class="mono">${formatDuration(session.durationMinutes)}</span> · unplanned</span></div>
      <div class="tl-item__actions">
        <button type="button" class="btn btn--sm btn--ghost" data-session-action="edit">${raw(icon("edit", { size: 13 }))}Edit</button>
      </div>
    </div>
  </li>`;
}

function timerItem(timer) {
  const subject = getSubject(timer.subjectId);
  return html`<li class="tl-item tl-item--timer is-active" style="--subject:${colorVar(subject.color)}">
    <div class="tl-item__time mono"><span>${toTimeString(new Date(timer.startedAt))}</span><span class="tl-item__end">now</span></div>
    <div class="tl-item__node" aria-hidden="true"></div>
    <div class="tl-item__card">
      <div class="tl-item__head">${subjectChip(subject)}${statusBadge("active")}</div>
      ${timer.topic ? html`<p class="tl-item__topic">${timer.topic}</p>` : ""}
      <div class="tl-item__foot"><span class="tl-item__meta mono" data-timer-clock>${formatClock(elapsedMs())}</span></div>
      <div class="tl-item__actions"><button type="button" class="btn btn--sm btn--secondary" data-timer="expand">${raw(icon("timer", { size: 13 }))}Open timer</button></div>
    </div>
  </li>`;
}

function nowMarker() {
  return html`<li class="tl-now" aria-label="Current time ${toTimeString(new Date(state.now))}">
    <span class="tl-now__time mono">${toTimeString(new Date(state.now))}</span>
    <span class="tl-now__line" aria-hidden="true"></span>
  </li>`;
}

/**
 * Renders the timeline for a date.
 * options.compact hides notes; options.emptyAction customises the empty CTA.
 */
export function dayTimeline(date, { compact = false } = {}) {
  const evaluated = evaluateDay(date);
  const linkedIds = new Set(evaluated.flatMap((e) => e.sessions.map((s) => s.id)));
  const unplanned = sessionsOn(date).filter((s) => !linkedIds.has(s.id));
  const timer = state.timer;
  const timerDate = timer ? toDateKey(new Date(timer.startedAt)) : null;
  const showTimer = timer && timerDate === date && !evaluated.some((e) => e.status === "active");

  const entries = [
    ...evaluated.map((e) => ({ at: timeToMinutes(e.plan.startTime), tpl: planItem(e, { compact }) })),
    ...unplanned.map((s) => ({ at: timeToMinutes(s.startTime), tpl: sessionItem(s) })),
  ];
  if (showTimer) entries.push({ at: timeToMinutes(toTimeString(new Date(timer.startedAt))), tpl: timerItem(timer) });
  entries.sort((a, b) => a.at - b.at);

  if (!entries.length) {
    const isPast = date < todayKey();
    return emptyState({
      title: isPast ? "Nothing planned or logged that day." : date === todayKey() ? "Nothing planned today." : `Nothing planned for ${relativeDayLabel(date).toLowerCase()}.`,
      text: isPast ? "You can still log learning you did without the timer." : "Create a learning block and give your day a direction.",
      actionLabel: isPast ? "Log session" : "Plan session",
      action: isPast ? "log-session" : "plan-session",
      iconName: "calendar",
      secondary: !isPast && evaluateDay(addDays(date, -1)).length ? `<button type="button" class="btn btn--ghost btn--sm" data-action="copy-yesterday">${icon("copy", { size: 14 })}Copy previous day</button>` : "",
    });
  }

  if (date === todayKey()) {
    const now = timeToMinutes(toTimeString(new Date(state.now)));
    const index = entries.findIndex((e) => e.at > now);
    entries.splice(index === -1 ? entries.length : index, 0, { at: now, tpl: nowMarker() });
  }

  return html`<ol class="timeline" aria-label="Learning timeline">${entries.map((e) => e.tpl)}</ol>`;
}

/* ---------- Plan actions ---------- */

const findPlan = (id) => state.data.plannedSessions.find((p) => p.id === id);

async function run(task, success) {
  try {
    await task();
    if (success) toastSuccess(success);
  } catch (error) {
    toastError(error);
  }
}

export async function deletePlanWithUndo(plan) {
  const ok = await confirmDialog({
    title: "Delete this learning block?",
    message: `${getSubject(plan.subjectId).name} · ${plan.startTime}–${plan.endTime}${plan.topic ? ` · ${plan.topic}` : ""}. Logged sessions are kept.`,
    confirmLabel: "Delete",
  });
  if (!ok) return;
  try {
    await deletePlannedSession(plan.id);
    toast("Plan deleted", {
      tone: "success",
      action: {
        label: "Undo",
        onClick: () => run(() => restorePlannedSession(plan), "Plan restored"),
      },
    });
  } catch (error) {
    toastError(error);
  }
}

export function planMenuItems(plan) {
  const subject = getSubject(plan.subjectId);
  const done = plan.status === "completed";
  return [
    { label: "Edit", icon: "edit", onSelect: () => openPlanForm({ planId: plan.id }) },
    {
      label: "Log session for this block",
      icon: "pencilLine",
      disabled: plan.date > todayKey(),
      onSelect: () => openSessionForm({ plannedSessionId: plan.id, date: plan.date, startTime: plan.startTime, endTime: plan.endTime, subjectId: plan.subjectId, topic: plan.topic }),
    },
    done
      ? { label: "Mark as not done", icon: "restore", onSelect: () => run(() => setPlanStatus(plan.id, "planned"), "Marked as planned") }
      : { label: "Mark as completed", icon: "checkCircle", onSelect: () => run(() => setPlanStatus(plan.id, "completed"), "Marked as completed") },
    plan.status === "skipped"
      ? { label: "Unskip", icon: "restore", onSelect: () => run(() => setPlanStatus(plan.id, "planned"), "Back in the plan") }
      : { label: "Skip", icon: "x", onSelect: () => run(() => setPlanStatus(plan.id, "skipped"), "Plan skipped") },
    "separator",
    { label: "Duplicate to next day", icon: "copy", disabled: subject.archived, onSelect: () => run(() => duplicatePlannedSession(plan.id), "Copied to the next day") },
    { label: "Duplicate to next week", icon: "copy", disabled: subject.archived, onSelect: () => run(() => duplicatePlannedSession(plan.id, addDays(plan.date, 7)), "Copied to next week") },
    "separator",
    { label: "Delete", icon: "trash", tone: "danger", onSelect: () => deletePlanWithUndo(plan) },
  ];
}

/** Wires plan & session item actions inside `root` (delegated). */
export function bindTimelineActions(root) {
  root.addEventListener("click", (event) => {
    const planBtn = event.target.closest("[data-plan-action]");
    if (planBtn) {
      const plan = findPlan(planBtn.closest("[data-plan-id]")?.dataset.planId);
      if (!plan) return;
      const action = planBtn.dataset.planAction;
      if (action === "start") quickStart({ subjectId: plan.subjectId, topic: plan.topic, plannedSessionId: plan.id });
      else if (action === "open-timer") openFocusTimer();
      else if (action === "complete") run(() => setPlanStatus(plan.id, "completed"), "Marked as completed");
      else if (action === "menu") openMenu(planBtn, planMenuItems(plan), { label: "Plan actions" });
      else if (action === "edit") openPlanForm({ planId: plan.id });
      return;
    }
    const sessionBtn = event.target.closest("[data-session-action]");
    if (sessionBtn) {
      const id = sessionBtn.closest("[data-session-id]")?.dataset.sessionId;
      if (sessionBtn.dataset.sessionAction === "edit" && id) openSessionForm({ sessionId: id });
    }
  });
}
