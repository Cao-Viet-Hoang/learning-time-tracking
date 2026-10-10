/*
 * Global action dispatcher for `data-action="…"` buttons.
 * Lets any template trigger common flows without importing forms directly.
 */

import { openPlanForm } from "./forms/planForm.js";
import { openSessionForm } from "./forms/sessionForm.js";
import { openSubjectForm } from "./forms/subjectForm.js";
import { openGoalsForm } from "./forms/goalsForm.js";
import { openStartTimer } from "./components/timer.js";
import { toastSuccess, toastError } from "./components/toast.js";
import { copyDayPlans } from "./services/plannedSessions.js";
import { navigate } from "./router.js";
import { todayKey, addDays } from "./utils/time.js";
import { pluralize } from "./utils/misc.js";

/** Context (e.g. the planner's selected date) is read from the closest [data-context-date]. */
function contextDate(el) {
  return el.closest("[data-context-date]")?.dataset.contextDate || todayKey();
}

let copying = false;

const ACTIONS = {
  "plan-session": (el) => openPlanForm({ date: el.dataset.date || contextDate(el), startTime: el.dataset.start || "" }),
  "log-session": (el) => {
    const date = el.dataset.date || contextDate(el);
    openSessionForm(date <= todayKey() ? { date } : {});
  },
  "start-timer": () => openStartTimer(),
  "new-subject": () => openSubjectForm(),
  "edit-goals": (el) => openGoalsForm({ focus: el.dataset.focus || null }),
  "go-subjects": () => navigate("/subjects"),
  "go-settings": () => navigate("/settings"),
  "copy-yesterday": async (el) => {
    // The planner re-renders as the copied blocks arrive, so guard by flag rather than the button.
    if (copying) return;
    copying = true;
    const date = contextDate(el);
    try {
      const count = await copyDayPlans(addDays(date, -1), date);
      toastSuccess(`Copied ${pluralize(count, "block")} from the previous day`);
    } catch (error) {
      toastError(error);
    } finally {
      copying = false;
    }
  },
};

export function initActions() {
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const handler = ACTIONS[el.dataset.action];
    if (handler) {
      event.preventDefault();
      // Close any dialog the action came from before opening a new flow.
      const dialog = el.closest("dialog");
      if (dialog && el.dataset.action === "new-subject") dialog.querySelector("[data-dialog-close]")?.click();
      handler(el);
    }
  });
}

export const runAction = (name, el = document.body) => ACTIONS[name]?.(el);
