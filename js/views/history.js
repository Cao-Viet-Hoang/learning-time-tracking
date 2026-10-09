/*
 * Session history: compact, day-grouped log with search, subject/date/source
 * filters and sort. Rows expand inline to reveal details and actions.
 */

import { state } from "../state.js";
import { html, raw, render } from "../utils/dom.js";
import { icon } from "../components/icons.js";
import { badge, subjectChip, emptyState, segmented } from "../components/ui.js";
import { confirmDialog } from "../components/modal.js";
import { toast, toastError } from "../components/toast.js";
import { reactive, dataReady, loadingView } from "./viewHelpers.js";
import { updateParams } from "../router.js";
import { getSubject, sortedSessions } from "../domain/selectors.js";
import { colorVar } from "../services/subjects.js";
import { deleteSession, restoreSession } from "../services/learningSessions.js";
import { openSessionForm } from "../forms/sessionForm.js";
import { getPrefs, setPref } from "../utils/storage.js";
import { todayKey, addDays, startOfMonth, startOfYear, isDateKey, relativeDayLabel, formatDuration, formatDate } from "../utils/time.js";
import { debounce, groupBy, normalizeText, pluralize, sumBy } from "../utils/misc.js";

const PAGE_SIZE = 60;

const RANGES = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom…" },
];

function rangeBounds(filters) {
  const today = todayKey();
  switch (filters.range) {
    case "7d":
      return [addDays(today, -6), today];
    case "30d":
      return [addDays(today, -29), today];
    case "month":
      return [startOfMonth(today), today];
    case "year":
      return [startOfYear(today), today];
    case "custom":
      return [isDateKey(filters.from) ? filters.from : "0000-01-01", isDateKey(filters.to) ? filters.to : "9999-12-31"];
    default:
      return ["0000-01-01", "9999-12-31"];
  }
}

function applyFilters(filters) {
  const [from, to] = rangeBounds(filters);
  const q = normalizeText(filters.q);
  return sortedSessions(filters.sort === "oldest" ? "asc" : "desc").filter((s) => {
    if (s.date < from || s.date > to) return false;
    if (filters.subject && s.subjectId !== filters.subject) return false;
    if (filters.source && s.source !== filters.source) return false;
    if (q) {
      const hay = normalizeText(`${s.topic} ${s.note} ${getSubject(s.subjectId).name}`);
      if (!q.split(/\s+/).every((term) => hay.includes(term))) return false;
    }
    return true;
  });
}

function toolbar(filters, subjects) {
  return html`<div class="toolbar" role="search">
    <div class="search">
      ${raw(icon("search", { size: 15 }))}
      <label class="sr-only" for="history-search">Search sessions</label>
      <input id="history-search" class="input search__input" type="search" placeholder="Search topic, note, subject…" value="${filters.q}" autocomplete="off">
      <kbd class="kbd search__kbd">/</kbd>
    </div>
    <div class="select-wrap select-wrap--sm">
      <label class="sr-only" for="history-subject">Subject</label>
      <select id="history-subject" class="input input--sm select">
        <option value="">All subjects</option>
        ${subjects.map((s) => html`<option value="${s.id}" ${s.id === filters.subject ? "selected" : ""}>${s.name}${s.archived ? " (archived)" : ""}</option>`)}
      </select>
    </div>
    <div class="select-wrap select-wrap--sm">
      <label class="sr-only" for="history-range">Date range</label>
      <select id="history-range" class="input input--sm select">
        ${RANGES.map((r) => html`<option value="${r.value}" ${r.value === filters.range ? "selected" : ""}>${r.label}</option>`)}
      </select>
    </div>
    ${
      filters.range === "custom"
        ? html`<div class="toolbar__dates">
            <label class="sr-only" for="history-from">From</label>
            <input id="history-from" type="date" class="input input--sm" value="${filters.from}" max="${todayKey()}">
            <span aria-hidden="true">→</span>
            <label class="sr-only" for="history-to">To</label>
            <input id="history-to" type="date" class="input input--sm" value="${filters.to}" max="${todayKey()}">
          </div>`
        : ""
    }
    <div class="select-wrap select-wrap--sm">
      <label class="sr-only" for="history-source">Source</label>
      <select id="history-source" class="input input--sm select">
        <option value="" ${!filters.source ? "selected" : ""}>Timer + manual</option>
        <option value="timer" ${filters.source === "timer" ? "selected" : ""}>Timer only</option>
        <option value="manual" ${filters.source === "manual" ? "selected" : ""}>Manual only</option>
      </select>
    </div>
    ${segmented("sort", [{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }], filters.sort, { label: "Sort order", size: "sm" })}
  </div>`;
}

function sessionRow(s, expanded) {
  const subject = getSubject(s.subjectId);
  const plan = s.plannedSessionId ? state.data.plannedSessions.find((p) => p.id === s.plannedSessionId) : null;
  return html`<li class="log-row ${expanded ? "is-expanded" : ""}" style="--subject:${colorVar(subject.color)}" data-session-id="${s.id}">
    <button type="button" class="log-row__main" data-row-toggle aria-expanded="${expanded}" aria-controls="detail-${s.id}">
      <span class="log-row__time mono">${s.startTime} — ${s.endTime}</span>
      <span class="log-row__subject">${subjectChip(subject, { size: "sm" })}</span>
      <span class="log-row__topic">${s.topic || html`<span class="is-muted">No topic</span>`}</span>
      <span class="log-row__icons">
        ${s.note ? html`<span data-tip="Has a note">${raw(icon("note", { size: 13 }))}</span>` : ""}
        <span data-tip="${s.source === "timer" ? "Tracked with timer" : "Logged manually"}">${raw(icon(s.source === "timer" ? "timer" : "pencilLine", { size: 13 }))}</span>
      </span>
      <span class="log-row__duration mono">${formatDuration(s.durationMinutes)}</span>
    </button>
    <div class="log-row__detail" id="detail-${s.id}" ${expanded ? "" : raw("hidden")}>
      <dl class="detail-list">
        <div><dt>Date</dt><dd>${formatDate(s.date, "longYear")}</dd></div>
        <div><dt>Source</dt><dd>${badge(s.source === "timer" ? "Timer" : "Manual", { tone: s.source === "timer" ? "accent" : "muted", iconName: s.source === "timer" ? "timer" : "pencilLine" })}</dd></div>
        ${plan ? html`<div><dt>Plan</dt><dd>${plan.startTime}–${plan.endTime}${plan.topic ? ` · ${plan.topic}` : ""}</dd></div>` : ""}
        ${s.note ? html`<div class="detail-list__wide"><dt>Note</dt><dd class="detail-list__note">${s.note}</dd></div>` : ""}
      </dl>
      <div class="log-row__actions">
        <button type="button" class="btn btn--sm btn--secondary" data-row-action="edit">${raw(icon("edit", { size: 13 }))}${s.source === "timer" ? "Edit details" : "Edit"}</button>
        <button type="button" class="btn btn--sm btn--ghost btn--danger-text" data-row-action="delete">${raw(icon("trash", { size: 13 }))}Delete</button>
      </div>
    </div>
  </li>`;
}

function results(list, expandedId, limit) {
  if (!list.length) return "";
  const visible = list.slice(0, limit);
  const groups = groupBy(visible, (s) => s.date);
  return html`<div class="log">
    ${[...groups.entries()].map(
      ([date, sessions]) => html`<section class="log-day" aria-label="${formatDate(date, "longYear")}">
        <header class="log-day__head">
          <h2 class="log-day__title">${relativeDayLabel(date)}</h2>
          <span class="log-day__total mono">${formatDuration(sumBy(sessions, (s) => s.durationMinutes))}</span>
        </header>
        <ul class="log-day__list">${sessions.map((s) => sessionRow(s, s.id === expandedId))}</ul>
      </section>`
    )}
    ${list.length > limit ? html`<button type="button" class="btn btn--secondary load-more" data-load-more>Show ${Math.min(PAGE_SIZE, list.length - limit)} more · ${list.length - limit} remaining</button>` : ""}
  </div>`;
}

export function mount(el, params) {
  const filters = {
    q: params.q || "",
    subject: params.subject || "",
    range: RANGES.some((r) => r.value === params.range) ? params.range : "all",
    from: params.from || "",
    to: params.to || "",
    source: ["timer", "manual"].includes(params.source) ? params.source : "",
    sort: params.sort === "oldest" ? "oldest" : params.sort === "newest" ? "newest" : getPrefs().historySort,
  };
  let expandedId = null;
  let limit = PAGE_SIZE;

  el.innerHTML = `<div class="view view--history" data-view-root>
    <header class="view-head">
      <div><p class="eyebrow">History</p><h1 class="view-title">Learning log</h1></div>
      <div class="view-head__actions">
        <button type="button" class="btn btn--primary" data-action="log-session">${icon("pencilLine", { size: 14 })}Log session</button>
      </div>
    </header>
    <div data-toolbar></div>
    <div data-summary class="log-summary" aria-live="polite"></div>
    <div data-results></div>
  </div>`;
  const root = el.firstElementChild;
  const toolbarEl = root.querySelector("[data-toolbar]");
  const summaryEl = root.querySelector("[data-summary]");
  const resultsEl = root.querySelector("[data-results]");

  const syncUrl = () =>
    updateParams({
      q: filters.q || null,
      subject: filters.subject || null,
      range: filters.range === "all" ? null : filters.range,
      from: filters.range === "custom" ? filters.from || null : null,
      to: filters.range === "custom" ? filters.to || null : null,
      source: filters.source || null,
      sort: filters.sort === getPrefs().historySort ? null : filters.sort,
    });

  const drawToolbar = () => {
    const subjects = [...state.data.subjects].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
    render(toolbarEl, toolbar(filters, subjects));
  };

  const drawResults = () => {
    if (!dataReady()) {
      render(resultsEl, loadingView("Loading history"));
      return;
    }
    const all = state.data.learningSessions;
    const list = applyFilters(filters);
    const filtered = Boolean(filters.q || filters.subject || filters.range !== "all" || filters.source);
    render(
      summaryEl,
      list.length
        ? html`<span><strong>${pluralize(list.length, "session")}</strong> · ${formatDuration(sumBy(list, (s) => s.durationMinutes))}</span>
            ${filtered ? html`<button type="button" class="link-btn link-btn--sm" data-clear>Clear filters</button>` : ""}`
        : ""
    );
    if (!all.length) {
      render(
        resultsEl,
        emptyState({
          title: "No learning logged yet.",
          text: state.data.subjects.length ? "Start the timer or log a session you already did — it will show up here." : "Create a subject first, then track or log your learning.",
          actionLabel: state.data.subjects.length ? "Log session" : "Create subject",
          action: state.data.subjects.length ? "log-session" : "new-subject",
          iconName: "history",
          secondary: state.data.subjects.length ? `<button type="button" class="btn btn--ghost btn--sm" data-action="start-timer">${icon("play", { size: 12 })}Start timer</button>` : "",
        })
      );
      return;
    }
    if (!list.length) {
      render(
        resultsEl,
        emptyState({
          title: "No sessions match these filters.",
          text: "Try a different search term or widen the date range.",
          iconName: "search",
          compact: true,
          secondary: `<button type="button" class="btn btn--secondary btn--sm" data-clear>Clear filters</button>`,
        })
      );
      return;
    }
    render(resultsEl, results(list, expandedId, limit));
  };

  const refresh = () => {
    limit = PAGE_SIZE;
    syncUrl();
    drawResults();
  };
  const onSearch = debounce(() => refresh(), 160);

  root.addEventListener("input", (event) => {
    if (event.target.id === "history-search") {
      filters.q = event.target.value;
      onSearch();
    }
  });
  root.addEventListener("change", (event) => {
    const { id, value } = event.target;
    if (id === "history-subject") filters.subject = value;
    else if (id === "history-source") filters.source = value;
    else if (id === "history-range") {
      filters.range = value;
      if (value === "custom" && !filters.from) {
        filters.from = addDays(todayKey(), -29);
        filters.to = todayKey();
      }
      drawToolbar();
    } else if (id === "history-from") filters.from = value;
    else if (id === "history-to") filters.to = value;
    else return;
    refresh();
  });

  root.addEventListener("click", async (event) => {
    const seg = event.target.closest("[data-seg='sort']");
    if (seg) {
      filters.sort = seg.dataset.value;
      setPref("historySort", filters.sort);
      drawToolbar();
      refresh();
      return;
    }
    if (event.target.closest("[data-clear]")) {
      Object.assign(filters, { q: "", subject: "", range: "all", from: "", to: "", source: "" });
      drawToolbar();
      refresh();
      return;
    }
    if (event.target.closest("[data-load-more]")) {
      limit += PAGE_SIZE;
      drawResults();
      return;
    }
    const toggle = event.target.closest("[data-row-toggle]");
    if (toggle) {
      const id = toggle.closest("[data-session-id]").dataset.sessionId;
      expandedId = expandedId === id ? null : id;
      drawResults();
      root.querySelector(`[data-session-id="${CSS.escape(id)}"] [data-row-toggle]`)?.focus({ preventScroll: true });
      return;
    }
    const action = event.target.closest("[data-row-action]");
    if (action) {
      const id = action.closest("[data-session-id]").dataset.sessionId;
      const session = state.data.learningSessions.find((s) => s.id === id);
      if (!session) return;
      if (action.dataset.rowAction === "edit") openSessionForm({ sessionId: id });
      else if (action.dataset.rowAction === "delete") await removeWithUndo(session);
    }
  });

  const onKey = (event) => {
    if (event.key === "/" && !event.target.closest("input, textarea, select, dialog")) {
      event.preventDefault();
      root.querySelector("#history-search")?.focus();
    }
  };
  document.addEventListener("keydown", onKey);

  drawToolbar();
  const stopData = reactive(drawResults, ["data"]);
  const stopToolbar = reactive(drawToolbar, ["data.subjects"]);
  return () => {
    stopData();
    stopToolbar();
    document.removeEventListener("keydown", onKey);
  };
}

async function removeWithUndo(session) {
  const subject = getSubject(session.subjectId);
  const ok = await confirmDialog({
    title: "Delete this session?",
    message: `${subject.name} · ${formatDate(session.date, "dayYear")} ${session.startTime}–${session.endTime} (${formatDuration(session.durationMinutes)}). It will no longer count toward your goals.`,
    confirmLabel: "Delete session",
  });
  if (!ok) return;
  try {
    await deleteSession(session.id);
    toast("Session deleted", {
      tone: "success",
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            await restoreSession(session);
            toast("Session restored", { tone: "success" });
          } catch (error) {
            toastError(error);
          }
        },
      },
    });
  } catch (error) {
    toastError(error);
  }
}

