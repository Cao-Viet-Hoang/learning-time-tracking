/*
 * Goal progress & pace.
 * "Expected" is the share of the target that should be done by the end of
 * today if time were spread evenly across the period.
 */

import { state } from "../state.js";
import { minutesBetween, getSubject } from "./selectors.js";
import { findGoal } from "../services/goals.js";
import {
  todayKey,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  diffDays,
  daysInMonth,
  parseDateKey,
} from "../utils/time.js";

export const PERIOD_LABEL = { daily: "Today", monthly: "This month", yearly: "This year" };

export function periodRange(type, today = todayKey()) {
  if (type === "daily") return { from: today, to: today };
  if (type === "monthly") return { from: startOfMonth(today), to: endOfMonth(today) };
  return { from: startOfYear(today), to: endOfYear(today) };
}

/**
 * Returns progress for a goal type (optionally for one subject).
 * pace: "done" | "ahead" | "on-track" | "behind" | null (no goal)
 */
export function goalProgress(type, subjectId = null, today = todayKey()) {
  const goal = findGoal(type, subjectId);
  const { from, to } = periodRange(type, today);
  const actual = minutesBetween(from, to, subjectId);
  const target = goal?.targetMinutes || 0;

  const totalDays = diffDays(from, to) + 1;
  const elapsedDays = diffDays(from, today) + 1; // includes today
  const remainingDays = totalDays - elapsedDays + 1; // includes today

  const result = {
    type,
    subjectId,
    goal,
    target,
    actual,
    from,
    to,
    totalDays,
    elapsedDays,
    remainingDays,
    percent: target ? Math.round((actual / target) * 100) : 0,
    remaining: Math.max(0, target - actual),
    expected: 0,
    delta: 0,
    pace: null,
    perDayNeeded: 0,
  };
  if (!target) return result;

  if (actual >= target) {
    result.pace = "done";
    return result;
  }

  if (type === "daily") {
    result.expected = target;
    result.delta = actual - target;
    result.pace = "on-track";
    return result;
  }

  result.expected = Math.round((target * elapsedDays) / totalDays);
  result.delta = actual - result.expected;
  result.perDayNeeded = Math.ceil(result.remaining / Math.max(1, remainingDays));
  // Tolerance: half a day's worth of the goal, so small gaps read as on track.
  const tolerance = target / totalDays / 2;
  result.pace = result.delta > tolerance ? "ahead" : result.delta < -tolerance ? "behind" : "on-track";
  return result;
}

export const PACE_LABEL = { done: "Goal reached", ahead: "Ahead", "on-track": "On track", behind: "Behind" };
export const PACE_TONE = { done: "success", ahead: "success", "on-track": "accent", behind: "warning" };

/** Per-subject goals with progress, sorted by subject name. */
export function subjectGoalProgress(type = "monthly") {
  return state.data.goals
    .filter((g) => g.type === type && g.subjectId)
    .map((g) => ({ ...goalProgress(type, g.subjectId), subject: getSubject(g.subjectId) }))
    .filter((p) => !p.subject.missing)
    .sort((a, b) => a.subject.name.localeCompare(b.subject.name));
}

/** Goal for an arbitrary range (weekly review etc.), derived from daily/monthly goals. */
export function derivedTargetForRange(from, to) {
  const days = diffDays(from, to) + 1;
  const daily = findGoal("daily")?.targetMinutes;
  if (daily) return { minutes: daily * days, basis: "daily goal" };
  const monthly = findGoal("monthly")?.targetMinutes;
  if (monthly) {
    const d = parseDateKey(from);
    const perDay = monthly / daysInMonth(d.getFullYear(), d.getMonth());
    return { minutes: Math.round(perDay * days), basis: "monthly goal" };
  }
  const yearly = findGoal("yearly")?.targetMinutes;
  if (yearly) return { minutes: Math.round((yearly / 365) * days), basis: "yearly goal" };
  return { minutes: 0, basis: null };
}
