/* Manual session entry & session editing. */

import { openDialog } from "../components/modal.js";
import { field, textInput, textArea, subjectSelect, topicInput, bindTopicSuggestions, noSubjectsNotice } from "./fields.js";
import { bindDialogForm } from "./submit.js";
import { html, raw } from "../utils/dom.js";
import { state } from "../state.js";
import { activeSubjects } from "../domain/selectors.js";
import { createManualSession, updateSession } from "../services/learningSessions.js";
import { todayKey, toTimeString, minutesToTime, timeToMinutes, spanMinutes, formatDuration, isTimeString, formatDate } from "../utils/time.js";

/**
 * openSessionForm({ sessionId }) edits; otherwise creates a manual session,
 * optionally prefilled from a plan ({ plannedSessionId, date, startTime, endTime, subjectId, topic }).
 */
export function openSessionForm(prefill = {}) {
  const session = prefill.sessionId ? state.data.learningSessions.find((s) => s.id === prefill.sessionId) : null;
  const isTimer = session?.source === "timer";
  const now = new Date();
  const nowMin = timeToMinutes(toTimeString(now));
  const defaults = {
    date: todayKey(),
    startTime: minutesToTime(Math.max(0, nowMin - 60)),
    endTime: toTimeString(now),
    subjectId: activeSubjects().length === 1 ? activeSubjects()[0].id : "",
    topic: "",
    note: "",
  };
  const values = session || { ...defaults, ...prefill };
  const hasSubjects = activeSubjects().length > 0 || session;

  const timeFields = isTimer
    ? html`<div class="readonly-times">
        <span>${formatDate(session.date, "weekdayDay")}</span>
        <span class="mono">${session.startTime} → ${session.endTime}</span>
        <span>${formatDuration(session.durationMinutes)}</span>
        <span class="badge badge--accent">timer</span>
      </div>
      <p class="field__hint">Times recorded by the timer can't be edited. Delete the session and log it manually if they are wrong.</p>`
    : html`<div class="form-row form-row--time">
        ${field({ name: "date", label: "Date", control: textInput({ name: "date", type: "date", value: values.date, attrs: `max="${todayKey()}"` }) })}
        ${field({ name: "startTime", label: "Start", control: textInput({ name: "startTime", type: "time", value: values.startTime, attrs: 'step="300"' }) })}
        ${field({ name: "endTime", label: "End", control: textInput({ name: "endTime", type: "time", value: values.endTime, attrs: 'step="300"' }) })}
      </div>
      <p class="duration-preview">Duration <strong data-duration-label>${formatDuration(spanMinutes(values.startTime, values.endTime))}</strong></p>`;

  const body = html`<form class="form" id="session-form" novalidate>
    <div class="form-banner" data-form-banner hidden></div>
    ${hasSubjects ? "" : noSubjectsNotice()}
    ${timeFields}
    ${field({ name: "subjectId", label: "Subject", control: subjectSelect({ value: values.subjectId }) })}
    ${field({ name: "topic", label: "Topic", optional: true, control: topicInput({ value: values.topic, subjectId: values.subjectId }) })}
    ${field({ name: "note", label: "Note", optional: true, control: textArea({ name: "note", value: values.note, placeholder: "What did you learn? What clicked?", rows: 3 }) })}
  </form>`;

  const api = openDialog({
    title: session ? "Edit session" : "Log a session",
    description: session ? "" : "Record learning you did without the timer.",
    variant: "drawer",
    body: raw(body),
    footer: `<button type="button" class="btn btn--ghost" data-dialog-close>Cancel</button>
             <button type="submit" class="btn btn--primary" form="session-form">${session ? "Save changes" : "Log session"}</button>`,
  });

  const form = api.el.querySelector("form");
  bindTopicSuggestions(form);
  const label = form.querySelector("[data-duration-label]");
  if (label) {
    form.addEventListener("input", () => {
      const { startTime: s, endTime: e } = form.elements;
      const ok = isTimeString(s.value) && isTimeString(e.value) && timeToMinutes(e.value) > timeToMinutes(s.value);
      label.textContent = ok ? formatDuration(spanMinutes(s.value, e.value)) : "—";
    });
  }

  bindDialogForm(api, {
    submit: (v, options) =>
      session ? updateSession(session.id, v, options) : createManualSession({ ...v, plannedSessionId: prefill.plannedSessionId || null }, options),
    success: session ? "Session updated" : "Session logged",
    conflictLabel: "Log anyway",
  });
  return api;
}
