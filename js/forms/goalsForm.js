/* Goals dialog: overall day/month/year targets plus optional per-subject monthly goals. */

import { openDialog } from "../components/modal.js";
import { durationInput, readDuration } from "./fields.js";
import { bindDialogForm } from "./submit.js";
import { html, raw } from "../utils/dom.js";
import { activeSubjects } from "../domain/selectors.js";
import { findGoal, saveGoals } from "../services/goals.js";
import { subjectChip } from "../components/ui.js";
import { ValidationError } from "../utils/errors.js";

const OVERALL = [
  { type: "daily", label: "Daily", hint: "per day", maxHours: 24 },
  { type: "monthly", label: "Monthly", hint: "per month", maxHours: 744 },
  { type: "yearly", label: "Yearly", hint: "per year", maxHours: 8784 },
];

export function openGoalsForm({ focus = null } = {}) {
  const subjects = activeSubjects();

  const body = html`<form class="form goals-form" id="goals-form" novalidate>
    <div class="form-banner" data-form-banner hidden></div>
    <fieldset class="goals-form__group">
      <legend class="goals-form__legend">Overall</legend>
      ${OVERALL.map(
        (g) => html`<div class="goal-row">
          <div class="goal-row__label"><strong>${g.label}</strong><span>${g.hint}</span></div>
          ${raw(durationInput({ name: g.type, minutes: findGoal(g.type)?.targetMinutes || 0, maxHours: g.maxHours }))}
          <p class="field__error" data-error-for="${g.type}" hidden></p>
        </div>`
      )}
      <p class="field__hint">Leave empty to remove a goal. Day, month and year goals are tracked independently.</p>
    </fieldset>
    <fieldset class="goals-form__group">
      <legend class="goals-form__legend">Per subject · monthly</legend>
      ${
        subjects.length
          ? subjects.map(
              (s) => html`<div class="goal-row">
                <div class="goal-row__label">${subjectChip(s, { size: "sm" })}</div>
                ${raw(durationInput({ name: `subject_${s.id}`, minutes: findGoal("monthly", s.id)?.targetMinutes || 0, maxHours: 744 }))}
                <p class="field__error" data-error-for="subject_${s.id}" hidden></p>
              </div>`
            )
          : html`<p class="field__hint">Create subjects to set per-subject goals.</p>`
      }
    </fieldset>
  </form>`;

  const api = openDialog({
    title: "Learning goals",
    description: "Set targets — progress and pace are calculated from today's date.",
    variant: "drawer",
    body: raw(body),
    footer: `<button type="button" class="btn btn--ghost" data-dialog-close>Cancel</button>
             <button type="submit" class="btn btn--primary" form="goals-form">Save goals</button>`,
    onMount: (el) => {
      if (focus) el.querySelector(`[name="${focus}__h"]`)?.focus();
    },
  });

  bindDialogForm(api, {
    submit: async (values) => {
      const entries = [
        ...OVERALL.map((g) => ({ type: g.type, subjectId: null, targetMinutes: readDuration(values, g.type), field: g.type })),
        ...subjects.map((s) => ({ type: "monthly", subjectId: s.id, targetMinutes: readDuration(values, `subject_${s.id}`), field: `subject_${s.id}` })),
      ];
      const daily = entries[0].targetMinutes;
      const monthly = entries[1].targetMinutes;
      if (daily > 24 * 60) throw new ValidationError("A day only has 24 hours.", { daily: "A day only has 24 hours." });
      if (monthly > 31 * 24 * 60) throw new ValidationError("That is more than a month.", { monthly: "That is more than a month." });
      const changed = await saveGoals(entries);
      return { changed };
    },
    success: (r) => (r.changed ? "Goals saved" : "No changes"),
  });
  return api;
}
