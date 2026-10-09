/*
 * Demo data — development utility only.
 * Generates realistic subjects, goals, ~4 months of sessions and plans for the
 * signed-in user. All demo documents carry `demo: true` so they can be removed
 * without touching real data.
 */

import { db } from "../data/db.js";
import { state } from "../state.js";
import { todayKey, addDays, minutesToTime, timeToMinutes, weekdayIndex, toTimeString } from "../utils/time.js";

const SUBJECTS = [
  { key: "c", name: "Embedded C", icon: "🔧", color: "blue", description: "Pointers, memory, interrupts and low-level C for microcontrollers.", topics: ["Function Pointer", "volatile vs atomic", "ISR", "Memory layout", "Bit manipulation", "Linker scripts", "Ring buffers", "DMA basics"] },
  { key: "en", name: "English", icon: "🗣️", color: "orange", description: "Vocabulary, listening and technical writing.", topics: ["Vocabulary", "Listening practice", "Technical writing", "Pronunciation", "Phrasal verbs", "IELTS reading"] },
  { key: "ai", name: "AI / LLM", icon: "🤖", color: "aqua", description: "LLM internals, agents and tooling.", topics: ["MCP Architecture", "Transformers", "Prompt engineering", "RAG pipelines", "Tool use", "Evaluation"] },
  { key: "k8s", name: "Docker & Kubernetes", icon: "🐳", color: "violet", description: "Containers, orchestration and deployment.", topics: ["Dockerfile best practices", "Pods & Deployments", "Helm charts", "Networking", "Volumes"] },
];

const TYPICAL_SLOTS = ["06:30", "07:00", "12:15", "18:00", "19:00", "20:15", "21:00", "21:30"];

/** Deterministic PRNG so demo data looks the same on every load. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

export async function loadDemoData({ days = 120 } = {}) {
  const store = db();
  const rand = rng(20261008);
  const today = todayKey();
  const nowMin = timeToMinutes(toTimeString());
  const ops = [];
  const base = () => ({ demo: true, createdAt: store.stamp(), updatedAt: store.stamp() });

  // Reuse subjects with the same name so demo data never duplicates them.
  const subjects = SUBJECTS.map((s) => {
    const existing = state.data.subjects.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    const id = existing?.id || store.newId("subjects");
    if (!existing) {
      ops.push({ type: "set", collection: "subjects", id, data: { ...base(), name: s.name, description: s.description, icon: s.icon, color: s.color, archived: false } });
    }
    return { ...s, id };
  });
  const weights = [0.4, 0.3, 0.2, 0.1];
  const weighted = () => {
    const r = rand();
    let acc = 0;
    for (let i = 0; i < subjects.length; i++) {
      acc += weights[i];
      if (r < acc) return subjects[i];
    }
    return subjects[0];
  };

  // Goals (only when not already configured).
  const goalDefaults = [
    { type: "daily", subjectId: null, targetMinutes: 120 },
    { type: "monthly", subjectId: null, targetMinutes: 30 * 60 },
    { type: "yearly", subjectId: null, targetMinutes: 365 * 60 },
    { type: "monthly", subjectId: subjects[0].id, targetMinutes: 12 * 60 },
    { type: "monthly", subjectId: subjects[1].id, targetMinutes: 8 * 60 },
  ];
  for (const g of goalDefaults) {
    const exists = state.data.goals.some((x) => x.type === g.type && (x.subjectId || null) === g.subjectId);
    if (!exists) ops.push({ type: "set", collection: "goals", id: `${g.type}__${g.subjectId || "all"}`, data: { ...base(), ...g } });
  }

  // History: learn on ~78% of days, more on weekday evenings.
  for (let offset = days; offset >= 0; offset--) {
    const date = addDays(today, -offset);
    const weekday = weekdayIndex(date);
    const learnChance = weekday >= 5 ? 0.6 : 0.85;
    const isToday = offset === 0;
    if (!isToday && rand() > learnChance) continue;

    const count = isToday ? 1 : 1 + Math.floor(rand() * (weekday >= 5 ? 2 : 3));
    const slots = [...TYPICAL_SLOTS].sort(() => rand() - 0.5).slice(0, count).sort();
    for (const slot of slots) {
      const subject = weighted();
      const start = timeToMinutes(slot) + Math.floor(rand() * 4) * 5;
      const duration = 20 + Math.floor(rand() * 9) * 10;
      if (isToday && start + duration > nowMin) continue;
      const topic = pick(rand, subject.topics);
      const source = rand() < 0.7 ? "timer" : "manual";
      const id = store.newId("learningSessions");

      // Plan most weekday evening sessions in advance (≈ realistic planned vs actual).
      let plannedSessionId = null;
      if (weekday < 5 && rand() < 0.6) {
        plannedSessionId = store.newId("plannedSessions");
        const plannedDuration = Math.max(30, Math.round((duration + (rand() < 0.5 ? 15 : -10)) / 15) * 15);
        ops.push({
          type: "set",
          collection: "plannedSessions",
          id: plannedSessionId,
          data: { ...base(), date, startTime: minutesToTime(start), endTime: minutesToTime(start + plannedDuration), subjectId: subject.id, topic, note: "", status: "planned" },
        });
      }
      ops.push({
        type: "set",
        collection: "learningSessions",
        id,
        data: {
          ...base(),
          date,
          startTime: minutesToTime(start),
          endTime: minutesToTime(start + duration),
          durationMinutes: duration,
          subjectId: subject.id,
          topic,
          note: rand() < 0.15 ? "Finally understood the core idea — write a summary tomorrow." : "",
          source,
          plannedSessionId,
        },
      });
    }

    // A few missed plans in the past.
    if (!isToday && weekday < 5 && rand() < 0.12) {
      const subject = weighted();
      ops.push({
        type: "set",
        collection: "plannedSessions",
        id: store.newId("plannedSessions"),
        data: { ...base(), date, startTime: "22:00", endTime: "22:45", subjectId: subject.id, topic: pick(rand, subject.topics), note: "", status: "planned" },
      });
    }
  }

  // Today's and the next few days' plan.
  const upcoming = [
    { day: 0, start: Math.max(nowMin + 30, 18 * 60), len: 60, s: 1 },
    { day: 0, start: Math.max(nowMin + 105, 19 * 60 + 15), len: 60, s: 0 },
    { day: 0, start: Math.max(nowMin + 180, 20 * 60 + 30), len: 45, s: 2 },
    { day: 1, start: 19 * 60, len: 60, s: 0 },
    { day: 1, start: 20 * 60 + 15, len: 45, s: 1 },
    { day: 2, start: 19 * 60, len: 90, s: 3 },
    { day: 3, start: 7 * 60, len: 30, s: 1 },
    { day: 3, start: 19 * 60 + 30, len: 60, s: 2 },
  ];
  for (const u of upcoming) {
    if (u.start + u.len >= 24 * 60) continue;
    const subject = subjects[u.s];
    ops.push({
      type: "set",
      collection: "plannedSessions",
      id: store.newId("plannedSessions"),
      data: {
        ...base(),
        date: addDays(today, u.day),
        startTime: minutesToTime(Math.round(u.start / 15) * 15),
        endTime: minutesToTime(Math.round(u.start / 15) * 15 + u.len),
        subjectId: subject.id,
        topic: pick(rand, subject.topics),
        note: "",
        status: "planned",
      },
    });
  }

  await store.batch(ops);
  return ops.length;
}

/** Removes every document flagged `demo: true` for the current user. */
export async function clearDemoData() {
  const ops = [];
  for (const name of ["learningSessions", "plannedSessions", "goals", "subjects"]) {
    for (const doc of state.data[name]) if (doc.demo) ops.push({ type: "delete", collection: name, id: doc.id });
  }
  if (ops.length) await db().batch(ops);
  return ops.length;
}

/** Deletes ALL learning data for the current user (subjects, goals, plans, sessions). */
export async function deleteAllUserData() {
  const ops = [];
  for (const name of ["learningSessions", "plannedSessions", "goals", "subjects"]) {
    for (const doc of state.data[name]) ops.push({ type: "delete", collection: name, id: doc.id });
  }
  if (ops.length) await db().batch(ops);
  return ops.length;
}

export const hasDemoData = () => ["learningSessions", "plannedSessions", "goals", "subjects"].some((n) => state.data[n].some((d) => d.demo));
