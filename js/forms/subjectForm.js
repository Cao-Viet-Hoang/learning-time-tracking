/* Create / edit Subject dialog. */

import { openDialog } from "../components/modal.js";
import { field, textInput, textArea } from "./fields.js";
import { bindDialogForm } from "./submit.js";
import { html, raw, esc } from "../utils/dom.js";
import { createSubject, updateSubject, VIVID_COLORS, PASTEL_COLORS, SUBJECT_ICONS, nextColor, colorVar, inkFor, isCustomColor } from "../services/subjects.js";
import { state } from "../state.js";

function swatch(color, selected) {
  return `<label class="swatch" style="--swatch:${colorVar(color)}" title="${esc(color.replace("pastel-", ""))}">
    <input type="radio" name="color" value="${color}" ${color === selected ? "checked" : ""}>
    <span class="swatch__dot" aria-hidden="true"></span>
    <span class="sr-only">${esc(color.replace("pastel-", "pastel "))}</span>
  </label>`;
}

/** Vivid + pastel presets, plus a custom swatch that opens the system colour picker. */
function colorPicker(selected) {
  const custom = isCustomColor(selected) ? selected : "";
  return `<div class="palette">
    <span class="palette__group-label" id="palette-vivid">Vivid</span>
    <div class="swatches swatches--grid" role="radiogroup" aria-labelledby="palette-vivid">${VIVID_COLORS.map((c) => swatch(c, selected)).join("")}</div>
    <span class="palette__group-label" id="palette-pastel">Pastel</span>
    <div class="swatches swatches--grid" role="radiogroup" aria-labelledby="palette-pastel">${PASTEL_COLORS.map((c) => swatch(c, selected)).join("")}</div>
    <span class="palette__group-label">Custom</span>
    <div class="palette__custom">
      <label class="swatch swatch--custom" style="${custom ? `--swatch:${custom}` : ""}" title="Pick any colour">
        <input type="radio" name="color" value="${custom || "#7c9cbf"}" data-custom-radio ${custom ? "checked" : ""}>
        <span class="swatch__dot" aria-hidden="true"></span>
        <input type="color" value="${custom || "#7c9cbf"}" data-custom-color aria-label="Pick a custom colour" tabindex="-1">
      </label>
      <input class="input input--sm palette__hex" data-custom-hex value="${custom}" placeholder="#rrggbb" maxlength="7" spellcheck="false" aria-label="Custom colour hex">
      <span class="palette__preview" data-color-preview aria-hidden="true"></span>
    </div>
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
    <input class="input input--sm icon-picker__custom" name="icon" value="${esc(selected || "")}" maxlength="8" placeholder="Or type / paste any emoji" aria-label="Custom icon">
  </div>`;
}

/** Wires the custom colour swatch, hex field and live preview chip. */
function bindColorPicker(form) {
  const radio = form.querySelector("[data-custom-radio]");
  const wheel = form.querySelector("[data-custom-color]");
  const hex = form.querySelector("[data-custom-hex]");
  const preview = form.querySelector("[data-color-preview]");
  const customSwatch = radio.closest(".swatch");

  const updatePreview = () => {
    const color = form.querySelector('[name="color"]:checked')?.value || "";
    const name = form.elements.name.value.trim() || "Subject";
    const icon = form.elements.icon.value.trim();
    preview.style.setProperty("--swatch", colorVar(color));
    preview.style.setProperty("--ink", inkFor(color));
    preview.textContent = icon ? `${icon} ${name}` : name;
  };
  const useCustom = (value) => {
    const color = value.toLowerCase();
    radio.value = color;
    radio.checked = true;
    wheel.value = color;
    customSwatch.style.setProperty("--swatch", color);
    updatePreview();
  };

  // Clicking the rainbow swatch opens the native picker; picking applies it.
  wheel.addEventListener("input", () => {
    hex.value = wheel.value;
    useCustom(wheel.value);
  });
  radio.addEventListener("click", () => wheel.click());
  hex.addEventListener("input", () => {
    let value = hex.value.trim();
    if (value && !value.startsWith("#")) value = `#${value}`;
    if (isCustomColor(value)) useCustom(value);
  });
  form.addEventListener("change", (event) => {
    if (event.target.name === "color" && event.target !== radio) hex.value = "";
    updatePreview();
  });
  form.addEventListener("input", (event) => {
    if (event.target.name === "name" || event.target.name === "icon") updatePreview();
  });
  updatePreview();
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

  bindColorPicker(form);

  bindDialogForm(api, {
    submit: (v) => (subject ? updateSubject(subject.id, v) : createSubject(v)),
    success: subject ? "Subject updated" : "Subject created",
  });
  return api;
}
