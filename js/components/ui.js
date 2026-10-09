/* Small presentational templates shared across views. */

import { html, raw } from "../utils/dom.js";
import { icon } from "./icons.js";
import { colorVar } from "../services/subjects.js";

/** tone: accent | success | warning | danger | muted */
export function badge(label, { tone = "muted", iconName = null, title = "" } = {}) {
  return html`<span class="badge badge--${tone}" ${title ? raw(`title="${title}"`) : ""}>${iconName ? raw(icon(iconName, { size: 12 })) : ""}${label}</span>`;
}

/** Coloured dot + optional icon + name. Archived/deleted subjects are flagged. */
export function subjectChip(subject, { size = "md", showArchived = true } = {}) {
  return html`<span class="subject-chip subject-chip--${size} ${subject.archived ? "is-archived" : ""}" style="--subject:${colorVar(subject.color)}">
    <span class="subject-chip__dot" aria-hidden="true"></span>
    ${subject.icon ? html`<span class="subject-chip__icon" aria-hidden="true">${subject.icon}</span>` : ""}
    <span class="subject-chip__name">${subject.name}</span>
    ${showArchived && subject.archived ? html`<span class="subject-chip__flag">${subject.missing ? "deleted" : "archived"}</span>` : ""}
  </span>`;
}

export function emptyState({ title, text = "", actionLabel = "", action = "", iconName = "sparkles", compact = false, secondary = "" } = {}) {
  return html`<div class="empty ${compact ? "empty--compact" : ""}">
    <div class="empty__icon" aria-hidden="true">${raw(icon(iconName, { size: compact ? 18 : 22 }))}</div>
    <p class="empty__title">${title}</p>
    ${text ? html`<p class="empty__text">${text}</p>` : ""}
    ${
      actionLabel || secondary
        ? html`<div class="empty__actions">
            ${actionLabel ? html`<button type="button" class="btn btn--primary btn--sm" data-action="${action}">${raw(icon("plus", { size: 14 }))}${actionLabel}</button>` : ""}
            ${raw(secondary)}
          </div>`
        : ""
    }
  </div>`;
}

export function skeletonLines(count = 3, { heights = [] } = {}) {
  return raw(
    Array.from({ length: count }, (_, i) => `<div class="skeleton" style="height:${heights[i] || 14}px;width:${90 - ((i * 17) % 40)}%"></div>`).join("")
  );
}

export function sectionHeader({ title, subtitle = "", actions = "", id = "" }) {
  return html`<div class="section-head">
    <div>
      <h2 class="section-head__title" ${id ? raw(`id="${id}"`) : ""}>${title}</h2>
      ${subtitle ? html`<p class="section-head__sub">${subtitle}</p>` : ""}
    </div>
    ${actions ? html`<div class="section-head__actions">${raw(actions)}</div>` : ""}
  </div>`;
}

/** Segmented control / tabs. items: [{ value, label }] */
export function segmented(name, items, active, { label = "", size = "md" } = {}) {
  return html`<div class="segmented segmented--${size}" role="tablist" ${label ? raw(`aria-label="${label}"`) : ""}>
    ${items.map(
      (item) =>
        html`<button type="button" role="tab" class="segmented__item" data-seg="${name}" data-value="${item.value}"
          aria-selected="${item.value === active ? "true" : "false"}" tabindex="${item.value === active ? "0" : "-1"}">${item.label}</button>`
    )}
  </div>`;
}
