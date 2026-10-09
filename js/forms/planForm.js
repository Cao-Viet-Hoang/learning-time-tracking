/* Create / edit planned session (a "learning block"). */

import { openDialog } from "../components/modal.js";
import { field, textInput, textArea, subjectSelect, topicInput, bindTopicSuggestions, noSubjectsNotice } from "./fields.js";
import { bindDialogForm } from "./submit.js";
import { html, raw } from "../utils/dom.js";
import { state } from "../state.js";
import { activeSubjects, plansOn } from "../domain/selectors.js";
import { createPlannedSession, updatePlannedSession } from "../services/plannedSessions.js";
import { todayKey, nextQuarterHour, minutesToTime, timeToMinutes, spanMinutes, formatDuration, isTimeString, MINUTES_PER_DAY } from "../utils/time.js";

const QUICK_DURATIONS = [30, 45, 60, 90, 120];

/** Suggests a start time: right after the last plan of the day, or the next quarter hour. */
function suggestStart(date) {
  const plans = plansOn(date);
  if (plans.length) {
    const lastEnd = Math.max(...plans.map((p) => timeToMinutes(p.endTime)));
    if (lastEnd <= MINUTES_PER_DAY - 30) return minutesToTime(lastEnd);
  }
  return date === todayKey() ? minutesToTime(nextQuarterHour()) : "19:00";
}

/**
 * openPlanForm({ planId }) to edit, or openPlanForm({ date, startTime, endTime, subjectId, topic }) to create.
 */
export function openPlanForm({ planId = null, date = todayKey(), startTime = "", endTime = "", subjectId = "", topic = "", note = "" } = {}) {
  const plan = planId ? state.data.plannedSessions.find((p) => p.id === planId) : null;
  const start = plan?.startTime || startTime || suggestStart(date);
  const values = plan || {
    date,
    startTime: start,
    endTime: endTime || minutesToTime(Math.min(timeToMinutes(start) + 60, MINUTES_PER_DAY - 1)),
    subjectId: subjectId || (activeSubjects().length === 1 ? activeSubjects()[0].id : ""),
    topic,
    note,
  };
  const hasSubjects = activeSubjects().length > 0 || (plan && plan.subjectId);

  const body = html`<form class="form" id="plan-form" novalidate>
    <div class="form-banner" data-form-banner hidden></div>
    ${hasSubjects ? "" : noSubjectsNotice()}
    <div class="form-row form-row--time">
      ${field({ name: "date", label: "Date", control: textInput({ name: "date", type: "date", value: values.date }) })}
      ${field({ name: "startTime", label: "Start", control: textInput({ name: "startTime", type: "time", value: values.startTime, attrs: 'step="300"' }) })}
      ${field({ name: "endTime", label: "End", control: textInput({ name: "endTime", type: "time", value: values.endTime, attrs: 'step="300"' }) })}
    </div>
    <div class="quick-durations" role="group" aria-label="Quick duration">
      <span class="quick-durations__label" data-duration-label>${formatDuration(spanMinutes(values.startTime, values.endTime))}</span>
      ${QUICK_DURATIONS.map((m) => html`<button type="button" class="chip-btn" data-minutes="${m}">${formatDuration(m)}</button>`)}
    </div>
    ${field({ name: "subjectId", label: "Subject", control: subjectSelect({ value: values.subjectId, attrs: plan ? "" : "autofocus" }) })}
    ${field({ name: "topic", label: "Topic", optional: true, control: topicInput({ value: values.topic, subjectId: values.subjectId }) })}
    ${field({ name: "note", label: "Note", optional: true, control: textArea({ name: "note", value: values.note, placeholder: "Goal for this block, resources, chapter…", rows: 2 }) })}
  </form>`;

  const api = openDialog({
    title: plan ? "Edit learning block" : "Plan a learning block",
    body: raw(body),
    footer: `<button type="button" class="btn btn--ghost" data-dialog-close>Cancel</button>
             <button type="submit" class="btn btn--primary" form="plan-form">${plan ? "Save changes" : "Add to plan"}</button>`,
  });

  const form = api.el.querySelector("form");
  bindTopicSuggestions(form);

  const label = form.querySelector("[data-duration-label]");
  const refreshDuration = () => {
    const { startTime: s, endTime: e } = form.elements;
    if (isTimeString(s.value) && isTimeString(e.value) && timeToMinutes(e.value) > timeToMinutes(s.value)) {
      label.textContent = formatDuration(spanMinutes(s.value, e.value));
    } else label.textContent = "—";
  };
  form.addEventListener("input", (event) => {
    if (["startTime", "endTime"].includes(event.target.name)) refreshDuration();
  });
  form.querySelectorAll("[data-minutes]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const s = form.elements.startTime.value;
      if (!isTimeString(s)) return;
      form.elements.endTime.value = minutesToTime(Math.min(timeToMinutes(s) + Number(btn.dataset.minutes), MINUTES_PER_DAY - 1));
      refreshDuration();
    })
  );

  bindDialogForm(api, {
    submit: (v, options) => (plan ? updatePlannedSession(plan.id, v, options) : createPlannedSession(v, options)),
    success: plan ? "Plan updated" : "Learning block planned",
    conflictLabel: "Plan anyway",
  });
  return api;
}
