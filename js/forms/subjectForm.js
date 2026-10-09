/* Create / edit Subject dialog. */

import { openDialog } from "../components/modal.js";
import { field, textInput, textArea } from "./fields.js";
import { bindDialogForm } from "./submit.js";
import { html, raw, esc } from "../utils/dom.js";
import { createSubject, updateSubject, SUBJECT_COLORS, SUBJECT_ICONS, nextColor, colorVar } from "../services/subjects.js";
import { state } from "../state.js";

function colorPicker(selected) {
  return `<div class="swatches" role="radiogroup" aria-label="Accent color">
    ${SUBJECT_COLORS.map(
      (c) => `<label class="swatch" style="--swatch:${colorVar(c)}">
        <input type="radio" name="color" value="${c}" ${c === selected ? "checked" : ""}>
        <span class="swatch__dot" aria-hidden="true"></span>
        <span class="sr-only">${c}</span>
      </label>`
    ).join("")}
  </div>`;
}

function iconPicker(selected) {
  return `<div class="icon-picker">
    <div class="icon-picker__grid" role="radiogroup" aria-label="Icon">
      <label class="icon-option" title="No icon">
        <input type="radio" name="iconChoice" value="" ${selected ? "" : "checked"}>
        <span aria-hidden="true">–</span><span class="sr-only">No icon</span>
      </label>
      ${SUBJECT_ICONS.map(
        (i) => `<label class="icon-option">
          <input type="radio" name="iconChoice" value="${esc(i)}" ${i === selected ? "checked" : ""}>
          <span aria-hidden="true">${esc(i)}</span><span class="sr-only">${esc(i)}</span>
        </label>`
      ).join("")}
    </div>
    <input class="input input--sm icon-picker__custom" name="icon" value="${esc(selected || "")}" maxlength="8" placeholder="Or type any emoji" aria-label="Custom icon">
  </div>`;
}

export function openSubjectForm(subjectId = null) {
  const subject = subjectId ? state.data.subjects.find((s) => s.id === subjectId) : null;
  const values = subject || { name: "", description: "", icon: "", color: nextColor() };

  const body = html`<form class="form" novalidate>
    <div class="form-banner" data-form-banner hidden></div>
    ${field({ name: "name", label: "Name", control: textInput({ name: "name", value: values.name, placeholder: "e.g. Embedded C", attrs: 'autofocus maxlength="60" required' }) })}
    ${field({ name: "description", label: "Description", optional: true, control: textArea({ name: "description", value: values.description, placeholder: "What does this subject cover?", rows: 2 }) })}
    <div class="field">
      <span class="field__label">Accent</span>
      ${raw(colorPicker(values.color))}
    </div>
    <div class="field">
      <span class="field__label">Icon <span class="field__optional">optional</span></span>
      ${raw(iconPicker(values.icon))}
    </div>
  </form>`;

  const api = openDialog({
    title: subject ? "Edit subject" : "New subject",
    description: subject ? "" : "Subjects are the fixed categories you log time against.",
    body,
    footer: `<button type="button" class="btn btn--ghost" data-dialog-close>Cancel</button>
             <button type="submit" class="btn btn--primary" form="subject-form">${subject ? "Save changes" : "Create subject"}</button>`,
  });

  const form = api.el.querySelector("form");
  form.id = "subject-form";
  // Radio icon choice mirrors into the free-text icon field.
  form.addEventListener("change", (event) => {
    if (event.target.name === "iconChoice") form.elements.icon.value = event.target.value;
  });
  form.elements.icon.addEventListener("input", () => {
    const match = [...form.querySelectorAll('[name="iconChoice"]')].find((r) => r.value === form.elements.icon.value);
    form.querySelectorAll('[name="iconChoice"]').forEach((r) => (r.checked = r === match));
  });

  bindDialogForm(api, {
    submit: (v) => (subject ? updateSubject(subject.id, v) : createSubject(v)),
    success: subject ? "Subject updated" : "Subject created",
  });
  return api;
}
