/* Settings: account, goals, appearance, data (export / demo / reset). */

import { state } from "../state.js";
import { html, raw, render, withBusy } from "../utils/dom.js";
import { icon } from "../components/icons.js";
import { segmented, badge } from "../components/ui.js";
import { confirmDialog } from "../components/modal.js";
import { toastSuccess, toastError } from "../components/toast.js";
import { reactive, dataReady } from "./viewHelpers.js";
import { findGoal } from "../services/goals.js";
import { signOut, isDevModeAvailable } from "../auth.js";
import { applyTheme } from "../theme.js";
import { loadDemoData, clearDemoData, deleteAllUserData, hasDemoData } from "../dev/seed.js";
import { getPrefs } from "../utils/storage.js";
import { downloadFile, pluralize } from "../utils/misc.js";
import { formatDuration, todayKey } from "../utils/time.js";
import { firebaseConfig } from "../../firebase-config.js";

function row(title, desc, control) {
  return html`<div class="settings-row">
    <div class="settings-row__text"><p class="settings-row__title">${title}</p>${desc ? html`<p class="settings-row__desc">${desc}</p>` : ""}</div>
    <div class="settings-row__control">${raw(control)}</div>
  </div>`;
}

function goalSummary() {
  const parts = ["daily", "monthly", "yearly"].map((t) => {
    const g = findGoal(t);
    return `${t[0].toUpperCase()}${t.slice(1)}: ${g ? formatDuration(g.targetMinutes) : "—"}`;
  });
  return parts.join(" · ");
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    user: state.user?.username,
    subjects: state.data.subjects,
    goals: state.data.goals,
    plannedSessions: state.data.plannedSessions,
    learningSessions: state.data.learningSessions,
  };
  downloadFile(`learning-data-${todayKey()}.json`, JSON.stringify(payload, null, 2));
}

function exportCsv() {
  const subjects = new Map(state.data.subjects.map((s) => [s.id, s.name]));
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["date", "start", "end", "minutes", "subject", "topic", "source", "note"].join(",")];
  [...state.data.learningSessions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .forEach((s) => lines.push([s.date, s.startTime, s.endTime, s.durationMinutes, esc(subjects.get(s.subjectId)), esc(s.topic), s.source, esc(s.note)].join(",")));
  downloadFile(`learning-sessions-${todayKey()}.csv`, lines.join("\n"), "text/csv");
}

export function mount(el) {
  el.innerHTML = `<div class="view view--settings" data-view-root></div>`;
  const root = el.firstElementChild;

  const draw = () => {
    const user = state.user;
    const isLocal = user?.mode === "local";
    const counts = Object.fromEntries(Object.entries(state.data).map(([k, v]) => [k, v.length]));
    const theme = getPrefs().theme;

    render(
      root,
      html`<header class="view-head"><div><p class="eyebrow">Settings</p><h1 class="view-title">Workspace</h1></div></header>

        <section class="settings-group" aria-labelledby="set-account">
          <h2 class="settings-group__title" id="set-account">Account</h2>
          ${row(
            user?.username || "—",
            isLocal ? "Local dev mode — data is stored only in this browser." : `Synced with Firestore · project ${firebaseConfig.projectId}`,
            `${badge(isLocal ? "Dev mode" : "Firestore", { tone: isLocal ? "warning" : "success", iconName: isLocal ? "monitor" : "cloud" })}
             <button type="button" class="btn btn--secondary btn--sm" data-settings="signout">${icon("logout", { size: 14 })}Sign out</button>`
          )}
          ${row("User ID", "All your records are scoped to this id.", `<code class="code">${user?.id || "—"}</code>`)}
        </section>

        <section class="settings-group" aria-labelledby="set-goals">
          <h2 class="settings-group__title" id="set-goals">Goals</h2>
          ${row("Learning goals", dataReady() ? goalSummary() : "Loading…", `<button type="button" class="btn btn--secondary btn--sm" data-action="edit-goals">${icon("target", { size: 14 })}Edit goals</button>`)}
        </section>

        <section class="settings-group" aria-labelledby="set-appearance">
          <h2 class="settings-group__title" id="set-appearance">Appearance</h2>
          ${row("Theme", "Follow the system or pick one.", String(segmented("theme", [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }], theme, { label: "Theme", size: "sm" })))}
          ${row(
            "Keyboard shortcuts",
            "",
            `<ul class="shortcuts">
              <li><kbd class="kbd">T</kbd> Start / open timer</li>
              <li><kbd class="kbd">Space</kbd> Pause / resume</li>
              <li><kbd class="kbd">P</kbd> Plan block</li>
              <li><kbd class="kbd">L</kbd> Log session</li>
              <li><kbd class="kbd">1</kbd>–<kbd class="kbd">6</kbd> Switch section</li>
              <li><kbd class="kbd">/</kbd> Search history</li>
            </ul>`
          )}
        </section>

        <section class="settings-group" aria-labelledby="set-data">
          <h2 class="settings-group__title" id="set-data">Data</h2>
          ${row(
            "Your records",
            `${pluralize(counts.subjects || 0, "subject")} · ${pluralize(counts.goals || 0, "goal")} · ${pluralize(counts.plannedSessions || 0, "plan")} · ${pluralize(counts.learningSessions || 0, "session")}`,
            `<button type="button" class="btn btn--secondary btn--sm" data-settings="export-json">${icon("download", { size: 14 })}JSON</button>
             <button type="button" class="btn btn--secondary btn--sm" data-settings="export-csv">${icon("download", { size: 14 })}CSV</button>`
          )}
          ${
            isDevModeAvailable() || isLocal
              ? html`<div class="settings-dev">
                  <p class="settings-dev__label">${raw(icon("database", { size: 13 }))}Development utilities</p>
                  ${row(
                    "Demo data",
                    "Generates 4 subjects, goals, ~4 months of sessions and upcoming plans. Demo records are tagged and can be removed separately.",
                    `<button type="button" class="btn btn--secondary btn--sm" data-settings="seed">${icon("sparkles", { size: 14 })}Load demo data</button>
                     ${hasDemoData() ? `<button type="button" class="btn btn--ghost btn--sm" data-settings="clear-demo">Remove demo data</button>` : ""}`
                  )}
                </div>`
              : ""
          }
          ${row("Delete all learning data", "Permanently removes every subject, goal, plan and session for this user.", `<button type="button" class="btn btn--danger btn--sm" data-settings="delete-all">${icon("trash", { size: 14 })}Delete everything</button>`)}
        </section>`
    );
    if (bulkAction) {
      root.querySelectorAll("[data-settings]").forEach((b) => (b.disabled = true));
      root.querySelector(`[data-settings="${bulkAction}"]`)?.classList.add("is-loading");
    }
  };

  let bulkAction = null;
  const runBulk = async (btn, task) => {
    bulkAction = btn.dataset.settings;
    root.querySelectorAll("[data-settings]").forEach((b) => (b.disabled = true));
    try {
      return await withBusy(btn, task);
    } finally {
      bulkAction = null;
      draw();
    }
  };

  root.addEventListener("click", async (event) => {
    const seg = event.target.closest("[data-seg='theme']");
    if (seg) {
      applyTheme(seg.dataset.value);
      draw();
      return;
    }
    const btn = event.target.closest("[data-settings]");
    if (!btn) return;
    const action = btn.dataset.settings;
    // Bulk actions re-render this view as records stream in, which would hand back an enabled button.
    if (bulkAction) return;
    try {
      if (action === "signout") {
        if (state.timer && !(await confirmDialog({ title: "Sign out with a running timer?", message: "The timer stays saved on this device and resumes when you sign back in.", confirmLabel: "Sign out", tone: "primary" }))) return;
        await signOut();
      } else if (action === "export-json") exportData();
      else if (action === "export-csv") exportCsv();
      else if (action === "seed") {
        if (!(await confirmDialog({ title: "Load demo data?", message: "Adds sample subjects, goals, sessions and plans to your account so you can explore the app.", confirmLabel: "Load demo data", tone: "primary" }))) return;
        const count = await runBulk(btn, () => loadDemoData());
        toastSuccess(`Demo data loaded (${count} records)`);
      } else if (action === "clear-demo") {
        if (!(await confirmDialog({ title: "Remove demo data?", message: "Deletes all records created by the demo generator. Your own data stays.", confirmLabel: "Remove" }))) return;
        const count = await runBulk(btn, () => clearDemoData());
        toastSuccess(`Removed ${count} demo records`);
      } else if (action === "delete-all") {
        if (!(await confirmDialog({ title: "Delete all learning data?", message: "Every subject, goal, plan and session for this user will be permanently deleted. Export first if you want a backup.", confirmLabel: "Delete everything" }))) return;
        const count = await runBulk(btn, () => deleteAllUserData());
        toastSuccess(`Deleted ${count} records`);
      }
    } catch (error) {
      toastError(error);
    }
  });

  return reactive(draw, ["data", "user"]);
}
