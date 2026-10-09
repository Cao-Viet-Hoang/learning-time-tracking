/*
 * Shared submit flow for dialog forms:
 * validate → busy state → service call → toast → close.
 * Overlap conflicts can be confirmed and retried with allowConflicts.
 */

import { formValues, showFieldErrors, withBusy } from "../utils/dom.js";
import { ValidationError, describeError } from "../utils/errors.js";
import { toastSuccess, toastError } from "../components/toast.js";

/**
 * bindDialogForm(dialogApi, {
 *   submit: async (values, { allowConflicts }) => result,
 *   success: "Saved" | (result) => string,
 *   conflictLabel: "Save anyway"
 * })
 */
export function bindDialogForm(api, { submit, success, conflictLabel = "Save anyway", onSuccess } = {}) {
  const form = api.el.querySelector("form");
  const submitBtn = api.el.querySelector('[type="submit"]');
  const banner = api.el.querySelector("[data-form-banner]");
  let allowConflicts = false;

  const setBanner = (message, { conflict = false } = {}) => {
    if (!banner) return;
    banner.hidden = !message;
    banner.innerHTML = message
      ? `<span>${message.replace(/</g, "&lt;")}</span>${conflict ? `<button type="button" class="btn btn--sm btn--secondary" data-force>${conflictLabel}</button>` : ""}`
      : "";
    banner.querySelector("[data-force]")?.addEventListener("click", () => {
      allowConflicts = true;
      form.requestSubmit();
    });
  };

  form.addEventListener("input", () => {
    allowConflicts = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFieldErrors(form, {});
    setBanner("");
    try {
      const result = await withBusy(submitBtn, () => submit(formValues(form), { allowConflicts }));
      const message = typeof success === "function" ? success(result) : success;
      if (message) toastSuccess(message, result?.queued ? { description: "Saved offline — will sync when you're back online." } : undefined);
      api.close(result);
      onSuccess?.(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        showFieldErrors(form, error.fields);
        setBanner(error.message, { conflict: error.code === "conflict" });
      } else {
        console.error(error);
        setBanner(describeError(error));
        toastError(error);
      }
    }
  });
  return form;
}
