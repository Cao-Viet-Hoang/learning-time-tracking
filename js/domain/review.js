/* Weekly / monthly review: a compact digest computed from source records. */

import { sessionsBetween } from "./selectors.js";
import { subjectDistribution, consistency } from "./analytics.js";
import { planSummary } from "./plans.js";
import { derivedTargetForRange } from "./goals.js";
import { findGoal } from "../services/goals.js";
import {
  todayKey,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  formatDate,
} from "../utils/time.js";
import { sumBy } from "../utils/misc.js";

export function reviewRange(kind, anchor = todayKey()) {
  if (kind === "week") return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

export function shiftAnchor(kind, anchor, step) {
  return kind === "week" ? addDays(anchor, step * 7) : addMonths(anchor, step);
}

export function reviewLabel(kind, from, to) {
  if (kind === "month") return formatDate(from, "month");
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return sameMonth ? `${Number(from.slice(8))} – ${formatDate(to, "dayYear")}` : `${formatDate(from)} – ${formatDate(to, "dayYear")}`;
}

export function buildReview(kind, anchor = todayKey()) {
  const { from, to } = reviewRange(kind, anchor);
  const today = todayKey();
  const sessions = sessionsBetween(from, to);
  const total = sumBy(sessions, (s) => s.durationMinutes);

  let target;
  if (kind === "month" && findGoal("monthly")) target = { minutes: findGoal("monthly").targetMinutes, basis: "monthly goal" };
  else target = derivedTargetForRange(from, to);

  const previous = reviewRange(kind, shiftAnchor(kind, anchor, -1));
  const previousTotal = sumBy(sessionsBetween(previous.from, previous.to), (s) => s.durationMinutes);

  const distribution = subjectDistribution(from, to);
  const plans = planSummary(from, to);
  const cons = consistency(from, to, today);

  return {
    kind,
    from,
    to,
    label: reviewLabel(kind, from, to),
    isCurrent: from <= today && to >= today,
    isFuture: from > today,
    total,
    target,
    goalPercent: target.minutes ? Math.round((total / target.minutes) * 100) : null,
    previousTotal,
    change: previousTotal ? (total - previousTotal) / previousTotal : null,
    sessionCount: sessions.length,
    learningDays: cons.learningDays,
    daysElapsed: cons.days,
    averagePerLearningDay: cons.averagePerLearningDay,
    topSubject: distribution.rows[0] || null,
    distribution,
    plans,
  };
}
