/* Shared form field templates. Every control has a visible label and an error slot. */

import { html, raw, esc } from "../utils/dom.js";
import { activeSubjects, getSubject, recentTopics } from "../domain/selectors.js";

export function field({ name, label, control, hint = "", optional = false, className = "" }) {
  return html`<div class="field ${className}">
    <label class="field__label" for="f-${name}">${label}${optional ? html`<span class="field__optional">optional</span>` : ""}</label>
    ${raw(control)}
    ${hint ? html`<p class="field__hint">${hint}</p>` : ""}
    <p class="field__error" data-error-for="${name}" hidden></p>
  </div>`;
}

export function textInput({ name, value = "", placeholder = "", type = "text", attrs = "" }) {
  return `<input class="input" id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${attrs}>`;
}

export function textArea({ name, value = "", placeholder = "", rows = 3 }) {
  return `<textarea class="input textarea" id="f-${name}" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
}

/**
 * Subject picker — only active subjects, plus the currently selected one if
 * it has since been archived (so editing old records keeps their subject).
 */
export function subjectSelect({ name = "subjectId", value = "", attrs = "" } = {}) {
  const options = activeSubjects();
  const current = value ? getSubject(value) : null;
  const extra = current && current.archived ? [current] : [];
  return `<div class="select-wrap">
    <select class="input select" id="f-${name}" name="${name}" ${attrs}>
      <option value="" ${value ? "" : "selected"} disabled>Choose a subject…</option>
      ${options.map((s) => `<option value="${esc(s.id)}" ${s.id === value ? "selected" : ""}>${esc(s.icon ? `${s.icon}  ${s.name}` : s.name)}</option>`).join("")}
      ${extra.map((s) => `<option value="${esc(s.id)}" selected>${esc(s.name)} (${s.missing ? "deleted" : "archived"})</option>`).join("")}
    </select>
  </div>`;
}

/** Topic input with a datalist of recent topics for the chosen subject. */
export function topicInput({ name = "topic", value = "", subjectId = "", placeholder = "What exactly? e.g. Function pointers" } = {}) {
  const listId = `dl-${name}`;
  return `<input class="input" id="f-${name}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" list="${listId}" maxlength="120" autocomplete="off">
    <datalist id="${listId}">${topicOptions(subjectId)}</datalist>`;
}

export function topicOptions(subjectId) {
  return recentTopics(subjectId).map((t) => `<option value="${esc(t)}"></option>`).join("");
}

/** Keeps the topic datalist in sync with the chosen subject. */
export function bindTopicSuggestions(form, subjectName = "subjectId", topicName = "topic") {
  const select = form.elements[subjectName];
  const list = form.querySelector(`#dl-${topicName}`);
  if (!select || !list) return;
  select.addEventListener("change", () => {
    list.innerHTML = topicOptions(select.value);
  });
}

export function noSubjectsNotice() {
  return html`<div class="notice notice--warning">
    <p><strong>No active subjects yet.</strong> Subjects keep your data consistent — create one first.</p>
    <button type="button" class="btn btn--sm btn--secondary" data-action="new-subject">Create subject</button>
  </div>`;
}

/** Hours + minutes duration picker that maps to a single minutes value. */
export function durationInput({ name, minutes = 0, maxHours = 24 }) {
  const h = Math.floor((minutes || 0) / 60);
  const m = (minutes || 0) % 60;
  return `<div class="duration-input" data-duration="${name}">
    <label class="duration-input__part">
      <input class="input" type="number" inputmode="numeric" min="0" max="${maxHours}" step="1" name="${name}__h" value="${h || ""}" placeholder="0" aria-label="Hours">
      <span>h</span>
    </label>
    <label class="duration-input__part">
      <input class="input" type="number" inputmode="numeric" min="0" max="59" step="5" name="${name}__m" value="${m || ""}" placeholder="0" aria-label="Minutes">
      <span>m</span>
    </label>
  </div>`;
}

export function readDuration(values, name) {
  const h = Number(values[`${name}__h`]) || 0;
  const m = Number(values[`${name}__m`]) || 0;
  return Math.round(h * 60 + m);
}
