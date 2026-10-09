/*
 * Planned vs actual.
 *
 * Actual time for a plan =
 *   full duration of sessions explicitly linked to it (plannedSessionId), plus
 *   the overlap of unlinked same-subject sessions with the plan's time window.
 */

import { state } from "../state.js";
import { sessionsOn, plansOn, plansBetween } from "./selectors.js";
import { timeToMinutes, spanMinutes, todayKey, nowMinutes } from "../utils/time.js";
import { sumBy } from "../utils/misc.js";

const COMPLETE_THRESHOLD = 0.9;

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function actualForPlan(plan) {
  const start = timeToMinutes(plan.startTime);
  const end = timeToMinutes(plan.endTime);
  let minutes = 0;
  const sessions = [];
  for (const s of sessionsOn(plan.date)) {
    if (s.plannedSessionId === plan.id) {
      minutes += s.durationMinutes;
      sessions.push(s);
    } else if (!s.plannedSessionId && s.subjectId === plan.subjectId) {
      const sStart = timeToMinutes(s.startTime);
      const o = overlap(start, end, sStart, sStart + s.durationMinutes);
      if (o > 0) {
        minutes += o;
        sessions.push(s);
      }
    }
  }
  return { minutes, sessions };
}

/**
 * Derived display state:
 *  completed | partial | missed | skipped | active | now | upcoming
 */
export function evaluatePlan(plan, { now = new Date(state.now), timer = state.timer } = {}) {
  const planned = spanMinutes(plan.startTime, plan.endTime);
  const { minutes: actual, sessions } = actualForPlan(plan);
  const ratio = planned ? actual / planned : 0;
  const today = todayKey();
  const current = nowMinutes(now);
  const start = timeToMinutes(plan.startTime);
  const end = timeToMinutes(plan.endTime);
  const isPast = plan.date < today || (plan.date === today && current >= end);
  const isNow = plan.date === today && current >= start && current < end;

  let status;
  if (timer && timer.plannedSessionId === plan.id) status = "active";
  else if (plan.status === "skipped") status = "skipped";
  else if (plan.status === "completed" || ratio >= COMPLETE_THRESHOLD) status = "completed";
  else if (actual > 0) status = isPast ? "partial" : "in-progress";
  else if (isNow) status = "now";
  else if (isPast) status = "missed";
  else status = "upcoming";

  return {
    plan,
    planned,
    actual,
    sessions,
    completion: planned ? Math.round(ratio * 100) : 0,
    status,
    markedDone: plan.status === "completed",
  };
}

export const PLAN_STATUS_META = {
  completed: { label: "Completed", tone: "success", icon: "checkCircle" },
  partial: { label: "Partially completed", short: "Partial", tone: "warning", icon: "clock" },
  "in-progress": { label: "In progress", tone: "accent", icon: "clock" },
  missed: { label: "Missed", tone: "danger", icon: "x" },
  skipped: { label: "Skipped", tone: "muted", icon: "x" },
  active: { label: "Tracking now", short: "Tracking", tone: "accent", icon: "timer" },
  now: { label: "Happening now", short: "Now", tone: "accent", icon: "play" },
  upcoming: { label: "Not started", short: "Upcoming", tone: "muted", icon: "clock" },
};

export const evaluateDay = (date) => plansOn(date).map((p) => evaluatePlan(p));

/** Aggregate planned vs actual over a date range. */
export function planSummary(from, to) {
  const evaluated = plansBetween(from, to).map((p) => evaluatePlan(p));
  const counts = { completed: 0, partial: 0, missed: 0, skipped: 0, upcoming: 0, active: 0, now: 0, "in-progress": 0 };
  evaluated.forEach((e) => counts[e.status]++);
  const considered = evaluated.filter((e) => e.status !== "skipped");
  return {
    total: evaluated.length,
    counts,
    plannedMinutes: sumBy(considered, (e) => e.planned),
    actualMinutes: sumBy(considered, (e) => Math.min(e.actual, e.planned)),
    evaluated,
  };
}

/** The next plan today that hasn't been done yet. */
export function nextPlanToday() {
  return evaluateDay(todayKey()).find((e) => ["now", "upcoming", "in-progress"].includes(e.status)) || null;
}
