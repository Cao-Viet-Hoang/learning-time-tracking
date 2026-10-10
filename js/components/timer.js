/*
 * Timer UI: start dialog, persistent mini timer (top bar / mobile dock) and
 * an expanded focus overlay. The ticking clock only updates text nodes, so
 * re-rendering any view never resets the timer — its source of truth is the
 * persisted timer state (services/timer.js).
 */

import { state, subscribe } from "../state.js";
import { html, raw, esc, formValues, showFieldErrors, withBusy } from "../utils/dom.js";
import { formatClock, formatDuration } from "../utils/time.js";
import { icon } from "./icons.js";
import { openDialog, confirmDialog } from "./modal.js";
import { toast, toastSuccess, toastError } from "./toast.js";
import { colorVar } from "../services/subjects.js";
import { getSubject, activeSubjects } from "../domain/selectors.js";
import { field, subjectSelect, topicInput, bindTopicSuggestions, noSubjectsNotice } from "../forms/fields.js";
import { startTimer, pauseTimer, resumeTimer, stopTimer, discardTimer, elapsedMs, isRunning, updateTimerDetails } from "../services/timer.js";
import { ValidationError } from "../utils/errors.js";

let tickHandle = null;
let focusApi = null;
let startApi = null;
let uiBound = false;
/** Set while a stop/discard is in progress: the clock is frozen and timer controls are locked. */
let stopping = null;

/* ---------- Start ---------- */

export function openStartTimer(prefill = {}) {
  if (state.timer) {
    openFocusTimer();
    return;
  }
  if (startApi) return;
  const subjects = activeSubjects();
  const values = { subjectId: subjects.length === 1 ? subjects[0].id : "", topic: "", ...prefill };

  const body = html`<form class="form" id="timer-form" novalidate>
    <div class="form-banner" data-form-banner hidden></div>
    ${subjects.length ? "" : noSubjectsNotice()}
    ${field({ name: "subjectId", label: "Subject", control: subjectSelect({ value: values.subjectId, attrs: values.subjectId ? "" : "autofocus" }) })}
    ${field({ name: "topic", label: "Topic", optional: true, control: topicInput({ value: values.topic, subjectId: values.subjectId, placeholder: "What are you focusing on?" }) })}
  </form>`;

  const api = openDialog({
    title: "Start focus timer",
    size: "sm",
    body: raw(body),
    footer: `<button type="button" class="btn btn--ghost" data-dialog-close>Cancel</button>
             <button type="submit" class="btn btn--primary" form="timer-form" ${subjects.length ? "" : "disabled"}>${icon("play", { size: 13 })}Start</button>`,
    onMount: (el) => {
      if (values.subjectId) el.querySelector('[name="topic"]')?.focus();
    },
    onClose: () => {
      if (startApi === api) startApi = null;
    },
  });
  startApi = api;
  const form = api.el.querySelector("form");
  bindTopicSuggestions(form);
  let started = false;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (started) return;
    const v = formValues(form);
    try {
      startTimer({ subjectId: v.subjectId, topic: v.topic, plannedSessionId: prefill.plannedSessionId || null });
      started = true;
      api.close();
      toast(`Tracking ${getSubject(v.subjectId).name}`, { tone: "info", duration: 2400 });
    } catch (error) {
      if (error instanceof ValidationError) {
        showFieldErrors(form, error.fields);
        const banner = api.el.querySelector("[data-form-banner]");
        banner.hidden = false;
        banner.textContent = error.message;
      } else toastError(error);
    }
  });
}

/** Starts immediately when everything is known (e.g. from a plan). */
export function quickStart({ subjectId, topic = "", plannedSessionId = null }) {
  if (state.timer) {
    toast("A timer is already running.", { tone: "warning", action: { label: "Open", onClick: openFocusTimer } });
    return;
  }
  try {
    startTimer({ subjectId, topic, plannedSessionId });
    toast(`Tracking ${getSubject(subjectId).name}${topic ? ` · ${topic}` : ""}`, { duration: 2400 });
  } catch (error) {
    toastError(error);
  }
}

/* ---------- Stop / discard ---------- */

/**
 * Freezes the clock at `now` and locks every timer control until the returned
 * release() is called, so a second click can never start a second stop.
 */
function beginStopping(now = Date.now()) {
  stopping = { frozenMs: elapsedMs(state.timer, now) };
  document.body.classList.add("timer-stopping");
  tick();
  lockControls();
  return () => {
    stopping = null;
    document.body.classList.remove("timer-stopping");
    lockControls();
    tick();
  };
}

function lockControls() {
  document.querySelectorAll('[data-timer="stop"], [data-timer="toggle"], [data-timer="discard"]').forEach((btn) => {
    btn.disabled = Boolean(stopping);
  });
}

export async function handleStop(button) {
  if (!state.timer || stopping) return;
  const now = Date.now();
  const ms = elapsedMs(state.timer, now);
  const release = beginStopping(now);
  try {
    if (ms < 60000) {
      const ok = await confirmDialog({
        title: "Discard this session?",
        message: "Sessions shorter than one minute aren't saved.",
        confirmLabel: "Discard",
      });
      if (ok) {
        discardTimer();
        focusApi?.close();
      }
      return;
    }
    const subject = getSubject(state.timer.subjectId);
    const result = await withBusy(button, () => stopTimer({ now }));
    focusApi?.close();
    if (result.saved) toastSuccess(`${formatDuration(result.minutes)} of ${subject.name} saved`);
  } catch (error) {
    // Timer stays persisted, so nothing is lost; the user can retry.
    toastError(error, { description: "Your timer is still running — try stopping again." });
  } finally {
    release();
  }
}

async function handleDiscard() {
  if (!state.timer || stopping) return;
  const release = beginStopping();
  try {
    const ok = await confirmDialog({
      title: "Discard timer?",
      message: `${formatClock(stopping.frozenMs)} of tracked time will be thrown away. This can't be undone.`,
      confirmLabel: "Discard time",
    });
    if (ok) {
      discardTimer();
      focusApi?.close();
      toast("Timer discarded");
    }
  } finally {
    release();
  }
}

function togglePause() {
  if (stopping) return;
  if (isRunning()) pauseTimer();
  else resumeTimer();
}

/* ---------- Mini timer ---------- */

function miniTemplate(t) {
  if (!t) {
    return `<button type="button" class="mini-timer mini-timer--idle" data-timer="start" aria-label="Start focus timer (T)">
      ${icon("timer", { size: 15 })}<span class="mini-timer__label">Start timer</span><kbd class="kbd">T</kbd>
    </button>`;
  }
  const subject = getSubject(t.subjectId);
  const running = isRunning(t);
  return `<div class="mini-timer ${running ? "is-running" : "is-paused"}" style="--subject:${colorVar(subject.color)}">
    <button type="button" class="mini-timer__main" data-timer="expand" aria-label="Open timer: ${esc(subject.name)}, ${running ? "running" : "paused"}">
      <span class="mini-timer__pulse" aria-hidden="true"></span>
      <span class="mini-timer__info">
        <span class="mini-timer__subject">${esc(subject.name)}${t.topic ? `<span class="mini-timer__topic"> · ${esc(t.topic)}</span>` : ""}</span>
      </span>
      <span class="mini-timer__clock mono" data-timer-clock>${formatClock(elapsedMs(t))}</span>
    </button>
    <button type="button" class="icon-btn icon-btn--sm" data-timer="toggle" aria-label="${running ? "Pause" : "Resume"} timer" data-tip="${running ? "Pause" : "Resume"} (Space)">
      ${icon(running ? "pause" : "play", { size: 13 })}
    </button>
    <button type="button" class="icon-btn icon-btn--sm" data-timer="stop" aria-label="Stop and save session" data-tip="Stop & save">
      ${icon("stop", { size: 13 })}
    </button>
  </div>`;
}

/* ---------- Focus overlay ---------- */

function focusBody(t) {
  const subject = getSubject(t.subjectId);
  const running = isRunning(t);
  return `
    <div class="focus" style="--subject:${colorVar(subject.color)}">
      <div class="focus__state ${running ? "is-running" : "is-paused"}">
        <span class="focus__dot" aria-hidden="true"></span>${running ? "Focusing" : "Paused"}
      </div>
      <div class="focus__subject">${subject.icon ? `<span aria-hidden="true">${esc(subject.icon)}</span>` : ""}${esc(subject.name)}</div>
      <label class="sr-only" for="focus-topic">Topic</label>
      <input id="focus-topic" class="focus__topic" value="${esc(t.topic)}" placeholder="Add a topic…" maxlength="120" data-focus-field="topic">
      <div class="focus__clock mono" data-timer-clock aria-live="off">${formatClock(elapsedMs(t))}</div>
      <p class="focus__since">Started ${new Date(t.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
      <div class="focus__actions">
        <button type="button" class="btn btn--secondary btn--lg" data-timer="toggle">${icon(running ? "pause" : "play", { size: 15 })}${running ? "Pause" : "Resume"}</button>
        <button type="button" class="btn btn--primary btn--lg" data-timer="stop">${icon("stop", { size: 14 })}Stop &amp; save</button>
      </div>
      <label class="focus__note-label" for="focus-note">Session note</label>
      <textarea id="focus-note" class="input textarea focus__note" rows="2" placeholder="Notes are saved with the session…" data-focus-field="note">${esc(t.note || "")}</textarea>
      <button type="button" class="btn btn--ghost btn--sm focus__discard" data-timer="discard">${icon("trash", { size: 13 })}Discard timer</button>
    </div>`;
}

export function openFocusTimer() {
  if (!state.timer) {
    openStartTimer();
    return;
  }
  if (focusApi) return;
  focusApi = openDialog({
    title: "Focus timer",
    size: "md",
    className: "dialog--focus",
    body: focusBody(state.timer),
    onClose: () => {
      focusApi = null;
    },
    onMount: (el) => {
      el.addEventListener("input", (event) => {
        const fieldName = event.target.dataset.focusField;
        if (fieldName) updateTimerDetails({ [fieldName]: event.target.value });
      });
    },
  });
  focusApi.el.querySelector('[data-timer="stop"]')?.focus();
}

function refreshFocus() {
  if (!focusApi) return;
  if (!state.timer) {
    focusApi.close();
    return;
  }
  const running = isRunning();
  const el = focusApi.el;
  el.querySelector(".focus__state").className = `focus__state ${running ? "is-running" : "is-paused"}`;
  el.querySelector(".focus__state").innerHTML = `<span class="focus__dot" aria-hidden="true"></span>${running ? "Focusing" : "Paused"}`;
  el.querySelector('.focus__actions [data-timer="toggle"]').innerHTML = `${icon(running ? "pause" : "play", { size: 15 })}${running ? "Pause" : "Resume"}`;
}

/* ---------- Wiring ---------- */

/** Re-renders only when the markup (minus the ticking clock) changes, so buttons keep focus. */
function renderMini() {
  const markup = miniTemplate(state.timer);
  const signature = markup.replace(/data-timer-clock>[^<]*</, "data-timer-clock><");
  document.querySelectorAll("[data-mini-timer]").forEach((host) => {
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;
    host.innerHTML = markup;
  });
  lockControls();
  document.body.classList.toggle("has-timer", Boolean(state.timer));
  document.body.classList.toggle("timer-running", isRunning());
  updateTitle();
}

const displayMs = () => (stopping ? stopping.frozenMs : elapsedMs());

function updateTitle() {
  const base = "Learning Time Tracker";
  if (state.timer) {
    const subject = getSubject(state.timer.subjectId);
    document.title = `${isRunning() && !stopping ? "●" : "❚❚"} ${formatClock(displayMs())} · ${subject.name}`;
  } else document.title = base;
}

function tick() {
  if (!state.timer) return;
  const text = formatClock(displayMs());
  document.querySelectorAll("[data-timer-clock]").forEach((el) => {
    if (el.textContent !== text) el.textContent = text;
  });
  updateTitle();
}

/** Safe to call on every sign-in: global listeners are bound only once. */
export function initTimerUI() {
  clearInterval(tickHandle);
  tickHandle = setInterval(tick, 1000);
  renderMini();
  if (uiBound) return;
  uiBound = true;

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-timer]");
    if (!btn) return;
    const action = btn.dataset.timer;
    if (action === "start") openStartTimer();
    else if (action === "expand") openFocusTimer();
    else if (action === "toggle") togglePause();
    else if (action === "stop") handleStop(btn);
    else if (action === "discard") handleDiscard();
  });

  subscribe((s, keys) => {
    if (keys.has("timer") || keys.has("data.subjects")) {
      renderMini();
      if (keys.has("timer")) refreshFocus();
    }
  });
}

export const toggleTimer = togglePause;
