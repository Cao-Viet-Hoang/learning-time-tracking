/*
 * Goal service.
 * One goal per (type, subjectId) pair: overall goals have subjectId = null.
 * Setting a goal to 0 / empty removes it.
 */

import { db } from "../data/db.js";
import { state } from "../state.js";
import { assertValid } from "../utils/errors.js";

const COLLECTION = "goals";
export const GOAL_TYPES = ["daily", "monthly", "yearly"];

const LIMITS = { daily: 24 * 60, monthly: 31 * 24 * 60, yearly: 366 * 24 * 60 };

/** Deterministic id keeps goals unique per type/subject without queries. */
const goalId = (type, subjectId) => `${type}__${subjectId || "all"}`;

export function findGoal(type, subjectId = null) {
  return state.data.goals.find((g) => g.type === type && (g.subjectId || null) === (subjectId || null)) || null;
}

/** Saves (or clears when minutes is 0) a goal. */
export async function saveGoal({ type, subjectId = null, targetMinutes }) {
  const minutes = Math.round(Number(targetMinutes) || 0);
  assertValid({
    type: GOAL_TYPES.includes(type) ? "" : "Unknown goal type.",
    targetMinutes: minutes < 0 ? "Goal cannot be negative." : minutes > LIMITS[type] ? `That is more time than a ${type === "daily" ? "day" : type === "monthly" ? "month" : "year"} has.` : "",
  });

  const store = db();
  const existing = findGoal(type, subjectId);
  const id = existing?.id || goalId(type, subjectId);

  if (minutes === 0) {
    if (existing) await store.remove(COLLECTION, id);
    return;
  }
  await store.set(
    COLLECTION,
    id,
    {
      type,
      subjectId: subjectId || null,
      targetMinutes: minutes,
      updatedAt: store.stamp(),
      ...(existing ? {} : { createdAt: store.stamp() }),
    },
    { merge: true }
  );
}

/** Saves several goals in one batch: [{ type, subjectId, targetMinutes }]. */
export async function saveGoals(entries) {
  const store = db();
  const ops = [];
  for (const entry of entries) {
    const minutes = Math.round(Number(entry.targetMinutes) || 0);
    const limit = LIMITS[entry.type];
    assertValid({ [entry.field || "targetMinutes"]: minutes < 0 || minutes > limit ? "Enter a realistic amount of time." : "" });
    const existing = findGoal(entry.type, entry.subjectId);
    const id = existing?.id || goalId(entry.type, entry.subjectId);
    if (minutes === 0) {
      if (existing) ops.push({ type: "delete", collection: COLLECTION, id });
    } else if (!existing || existing.targetMinutes !== minutes) {
      ops.push({
        type: "set",
        collection: COLLECTION,
        id,
        merge: true,
        data: {
          type: entry.type,
          subjectId: entry.subjectId || null,
          targetMinutes: minutes,
          updatedAt: store.stamp(),
          ...(existing ? {} : { createdAt: store.stamp() }),
        },
      });
    }
  }
  if (ops.length) await store.batch(ops);
  return ops.length;
}
