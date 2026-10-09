/*
 * Subjects: the controlled vocabulary. List with lifetime/month stats,
 * a detail drawer per subject, archive/restore with history preserved.
 */

import { state } from "../state.js";
import { html, raw, render } from "../utils/dom.js";
import { icon } from "../components/icons.js";
import { badge, emptyState } from "../components/ui.js";
import { openMenu } from "../components/dropdown.js";
import { openDialog, confirmDialog } from "../components/modal.js";
import { toast, toastError } from "../components/toast.js";
import { progressBar } from "../components/progress.js";
import { sparkBars } from "../components/charts.js";
import { quickStart, openStartTimer } from "../components/timer.js";
import { reactive, dataReady, loadingView } from "./viewHelpers.js";
import { activeSubjects, archivedSubjects, getSubject } from "../domain/selectors.js";
import { subjectStats, subjectDailySeries, totalsBySubject } from "../domain/analytics.js";
import { goalProgress } from "../domain/goals.js";
import { colorVar, setSubjectArchived } from "../services/subjects.js";
import { openSubjectForm } from "../forms/subjectForm.js";
import { openGoalsForm } from "../forms/goalsForm.js";
import { navigate } from "../router.js";
import { readJSON, writeJSON } from "../utils/storage.js";
import { formatDuration, formatHours, relativeDayLabel } from "../utils/time.js";
import { pluralize } from "../utils/misc.js";

function subjectRow(subject, maxTotal) {
  const stats = subjectStats(subject.id);
  const goal = !subject.archived ? goalProgress("monthly", subject.id) : null;
  const color = colorVar(subject.color);
  return html`<li class="subject-row ${subject.archived ? "is-archived" : ""}" style="--subject:${color}" data-subject-id="${subject.id}">
    <button type="button" class="subject-row__main" data-subject-open aria-label="Open ${subject.name} details">
      <span class="subject-row__icon" aria-hidden="true">${subject.icon || subject.name.slice(0, 1).toUpperCase()}</span>
      <span class="subject-row__text">
        <span class="subject-row__name">${subject.name}${subject.archived ? html` ${badge("Archived", { tone: "muted" })}` : ""}</span>
        <span class="subject-row__desc">${subject.description || (stats.lastDate ? `Last studied ${relativeDayLabel(stats.lastDate).toLowerCase()}` : "Not studied yet")}</span>
      </span>
    </button>
    <div class="subject-row__spark">${sparkBars(subjectDailySeries(subject.id, 28), color)}</div>
    <div class="subject-row__stat">
      <span class="subject-row__label">This month</span>
      <span class="mono">${formatDuration(stats.month, { empty: "—" })}</span>
      ${goal?.target ? html`<span class="subject-row__goal">${progressBar({ value: goal.actual, max: goal.target, color, tone: "subject", size: "xs" })}<span>${goal.percent}% of ${formatHours(goal.target)}</span></span>` : ""}
    </div>
    <div class="subject-row__stat subject-row__stat--total">
      <span class="subject-row__label">Total</span>
      <span class="subject-row__total mono">${formatDuration(stats.total, { empty: "0m" })}</span>
      <span class="subject-row__share" aria-hidden="true"><span style="width:${maxTotal ? (stats.total / maxTotal) * 100 : 0}%"></span></span>
    </div>
    <div class="subject-row__actions">
      ${!subject.archived && !state.timer ? html`<button type="button" class="icon-btn icon-btn--sm" data-subject-action="start" aria-label="Start timer for ${subject.name}" data-tip="Start timer">${raw(icon("play", { size: 12 }))}</button>` : ""}
      <button type="button" class="icon-btn icon-btn--sm" data-subject-action="menu" aria-haspopup="menu" aria-label="More actions for ${subject.name}">${raw(icon("more", { size: 15 }))}</button>
    </div>
  </li>`;
}

async function toggleArchive(subject) {
  if (!subject.archived) {
    const ok = await confirmDialog({
      title: `Archive “${subject.name}”?`,
      message: "It disappears from subject pickers for new plans and sessions. All history and statistics are kept, and you can restore it any time.",
      confirmLabel: "Archive",
      tone: "primary",
    });
    if (!ok) return;
  }
  try {
    await setSubjectArchived(subject.id, !subject.archived);
    toast(subject.archived ? `${subject.name} restored` : `${subject.name} archived`, {
      tone: "success",
      action: subject.archived ? null : { label: "Undo", onClick: () => setSubjectArchived(subject.id, false).catch(toastError) },
    });
  } catch (error) {
    toastError(error);
  }
}

function menuItems(subject) {
  return [
    { label: "View details", icon: "info", onSelect: () => openSubjectDetail(subject.id) },
    { label: "Edit", icon: "edit", onSelect: () => openSubjectForm(subject.id) },
    { label: "View history", icon: "history", onSelect: () => navigate("/history", { subject: subject.id }) },
    ...(subject.archived ? [] : [{ label: "Set monthly goal", icon: "target", onSelect: () => openGoalsForm() }]),
    "separator",
    subject.archived
      ? { label: "Restore", icon: "restore", onSelect: () => toggleArchive(subject) }
      : { label: "Archive", icon: "archive", onSelect: () => toggleArchive(subject) },
  ];
}

export function openSubjectDetail(subjectId) {
  const subject = getSubject(subjectId);
  if (subject.missing) return;
  const stats = subjectStats(subjectId);
  const color = colorVar(subject.color);
  const goal = goalProgress("monthly", subjectId);

  openDialog({
    title: subject.name,
    description: subject.description,
    variant: "drawer",
    body: String(html`<div class="subject-detail" style="--subject:${color}">
      <div class="subject-detail__stats">
        <div><span class="stat-label">Total</span><span class="stat-value mono">${formatDuration(stats.total)}</span></div>
        <div><span class="stat-label">This month</span><span class="stat-value mono">${formatDuration(stats.month)}</span></div>
        <div><span class="stat-label">Last 7 days</span><span class="stat-value mono">${formatDuration(stats.week)}</span></div>
        <div><span class="stat-label">Sessions</span><span class="stat-value mono">${stats.count}</span></div>
        <div><span class="stat-label">Avg session</span><span class="stat-value mono">${formatDuration(stats.average)}</span></div>
        <div><span class="stat-label">Learning days</span><span class="stat-value mono">${stats.days}</span></div>
      </div>
      ${
        goal.target
          ? html`<div class="subject-detail__goal">
              <div class="row-between"><span class="stat-label">Monthly goal</span><span class="mono">${formatHours(goal.actual)} / ${formatHours(goal.target)}</span></div>
              ${progressBar({ value: goal.actual, max: goal.target, marker: goal.pace !== "done" ? goal.expected / goal.target : null, color, tone: "subject" })}
            </div>`
          : ""
      }
      <div class="subject-detail__section">
        <h3 class="stat-label">Last 28 days</h3>
        ${sparkBars(subjectDailySeries(subjectId, 28), color)}
      </div>
      <div class="subject-detail__section">
        <h3 class="stat-label">Top topics</h3>
        ${
          stats.topics.length
            ? html`<ul class="topic-list">${stats.topics.slice(0, 8).map((t) => html`<li><span>${t.topic}</span><span class="mono">${formatDuration(t.minutes)} · ${pluralize(t.count, "session")}</span></li>`)}</ul>`
            : html`<p class="is-muted">Topics you log for this subject appear here.</p>`
        }
      </div>
    </div>`),
    footer: `<a class="btn btn--ghost" href="#/history?subject=${encodeURIComponent(subjectId)}" data-dialog-close>View history</a>
             <button type="button" class="btn btn--secondary" data-detail-edit>Edit</button>`,
    onMount: (el, api) => {
      el.querySelector("[data-detail-edit]").addEventListener("click", () => {
        api.close();
        openSubjectForm(subjectId);
      });
    },
  });
}

export function mount(el) {
  el.innerHTML = `<div class="view view--subjects" data-view-root></div>`;
  const root = el.firstElementChild;
  let showArchived = readJSON("subjects:showArchived", false);

  const draw = () => {
    if (!dataReady()) return render(root, loadingView("Loading subjects"));
    const active = activeSubjects();
    const archived = archivedSubjects();
    const totals = totalsBySubject();
    const ranked = [...active].sort((a, b) => (totals.get(b.id) || 0) - (totals.get(a.id) || 0));
    const maxTotal = Math.max(0, ...[...totals.values()]);

    render(
      root,
      html`<header class="view-head">
          <div>
            <p class="eyebrow">Subjects</p>
            <h1 class="view-title">What you learn</h1>
            <p class="view-sub">Subjects are fixed categories — topics stay flexible inside each session.</p>
          </div>
          <div class="view-head__actions">
            <button type="button" class="btn btn--secondary" data-action="edit-goals">${raw(icon("target", { size: 14 }))}Goals</button>
            <button type="button" class="btn btn--primary" data-action="new-subject">${raw(icon("plus", { size: 14 }))}New subject</button>
          </div>
        </header>
        ${
          active.length
            ? html`<section aria-labelledby="active-title">
                <div class="list-head"><h2 class="list-head__title" id="active-title">Active <span class="count">${active.length}</span></h2><span class="list-head__hint">Ranked by total time</span></div>
                <ul class="subject-list">${ranked.map((s) => subjectRow(s, maxTotal))}</ul>
              </section>`
            : emptyState({
                title: archived.length ? "All subjects are archived." : "Your learning workspace is empty.",
                text: archived.length ? "Restore one below or create a new subject to keep planning." : "Create your first subject to start tracking your learning.",
                actionLabel: "Create subject",
                action: "new-subject",
                iconName: "layers",
              })
        }
        ${
          archived.length
            ? html`<section class="archived-section" aria-labelledby="archived-title">
                <button type="button" class="list-head list-head--toggle" data-toggle-archived aria-expanded="${showArchived}">
                  <h2 class="list-head__title" id="archived-title">${raw(icon(showArchived ? "chevronDown" : "chevronRight", { size: 14 }))}Archived <span class="count">${archived.length}</span></h2>
                  <span class="list-head__hint">Kept in history, hidden from pickers</span>
                </button>
                ${showArchived ? html`<ul class="subject-list subject-list--archived">${archived.map((s) => subjectRow(s, maxTotal))}</ul>` : ""}
              </section>`
            : ""
        }`
    );
  };

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-toggle-archived]")) {
      showArchived = !showArchived;
      writeJSON("subjects:showArchived", showArchived);
      draw();
      return;
    }
    const row = event.target.closest("[data-subject-id]");
    if (!row) return;
    const subject = state.data.subjects.find((s) => s.id === row.dataset.subjectId);
    if (!subject) return;
    if (event.target.closest("[data-subject-open]")) return openSubjectDetail(subject.id);
    const action = event.target.closest("[data-subject-action]");
    if (!action) return;
    if (action.dataset.subjectAction === "start") {
      if (state.timer) openStartTimer();
      else quickStart({ subjectId: subject.id });
    } else if (action.dataset.subjectAction === "menu") openMenu(action, menuItems(subject), { label: `${subject.name} actions` });
  });

  return reactive(draw);
}

