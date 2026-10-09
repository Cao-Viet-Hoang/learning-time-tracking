/*
 * App shell: top command bar (brand · section nav · timer · quick add · account),
 * mobile bottom dock with a central timer button, and sync status.
 */

import { state, subscribe } from "./state.js";
import { html, raw, render } from "./utils/dom.js";
import { icon } from "./components/icons.js";
import { openMenu } from "./components/dropdown.js";
import { confirmDialog } from "./components/modal.js";
import { ROUTES, navigate } from "./router.js";
import { runAction } from "./actions.js";
import { signOut } from "./auth.js";
import { applyTheme } from "./theme.js";
import { getPrefs } from "./utils/storage.js";

const PRIMARY = ROUTES.filter((r) => r.name !== "settings");
const THEMES = [
  { value: "system", label: "System", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

export function renderShell(el) {
  render(
    el,
    html`<a class="skip-link" href="#main">Skip to content</a>
      <header class="topbar">
        <div class="topbar__inner">
          <a class="brand" href="#/" aria-label="Cadence — Today">
            <span class="brand__mark" aria-hidden="true"><span></span><span></span><span></span></span>
            <span class="brand__name">Cadence</span>
          </a>
          <nav class="nav" aria-label="Sections">
            ${PRIMARY.map(
              (r) => html`<a class="nav__link" href="#${r.path}" data-route="${r.name}">${raw(icon(r.icon, { size: 15 }))}<span>${r.label}</span></a>`
            )}
          </nav>
          <div class="topbar__right">
            <div class="topbar__timer" data-mini-timer></div>
            <button type="button" class="btn btn--secondary btn--sm topbar__add" data-quick-add aria-haspopup="menu" aria-expanded="false">${raw(icon("plus", { size: 14 }))}<span>New</span></button>
            <span class="sync" data-sync role="status" aria-live="polite"></span>
            <button type="button" class="avatar" data-account aria-haspopup="menu" aria-expanded="false" aria-label="Account menu">
              <span data-avatar-initial></span>
            </button>
          </div>
        </div>
      </header>
      <main class="main" id="main" tabindex="-1">
        <div class="outlet" data-outlet></div>
      </main>
      <nav class="dock" aria-label="Sections">
        ${ROUTES.filter((r) => ["home", "planner"].includes(r.name)).map(
          (r) => html`<a class="dock__link" href="#${r.path}" data-route="${r.name}">${raw(icon(r.icon, { size: 19 }))}<span>${r.label}</span></a>`
        )}
        <div class="dock__timer" data-mini-timer></div>
        ${ROUTES.filter((r) => ["history", "insights"].includes(r.name)).map(
          (r) => html`<a class="dock__link" href="#${r.path}" data-route="${r.name}">${raw(icon(r.icon, { size: 19 }))}<span>${r.label}</span></a>`
        )}
        <button type="button" class="dock__link" data-dock-more aria-haspopup="menu" aria-expanded="false">${raw(icon("menu", { size: 19 }))}<span>More</span></button>
      </nav>`
  );

  el.querySelector("[data-quick-add]").addEventListener("click", (event) =>
    openMenu(
      event.currentTarget,
      [
        { label: "Start timer", icon: "play", hint: "T", onSelect: () => runAction("start-timer") },
        { label: "Plan a block", icon: "calendar", hint: "P", onSelect: () => runAction("plan-session") },
        { label: "Log a session", icon: "pencilLine", hint: "L", onSelect: () => runAction("log-session") },
        "separator",
        { label: "New subject", icon: "layers", onSelect: () => runAction("new-subject") },
        { label: "Edit goals", icon: "target", onSelect: () => runAction("edit-goals") },
      ],
      { label: "Create" }
    )
  );

  const accountMenu = (trigger) => {
    const activeTheme = getPrefs().theme;
    openMenu(
      trigger,
      [
        { label: state.user?.username || "Account", icon: "user", disabled: true },
        "separator",
        { label: "Subjects", icon: "layers", onSelect: () => navigate("/subjects") },
        { label: "Settings", icon: "settings", onSelect: () => navigate("/settings") },
        "separator",
        ...THEMES.map((t) => ({
          label: t.label,
          icon: t.icon,
          hint: t.value === activeTheme ? "✓" : "",
          onSelect: () => applyTheme(t.value),
        })),
        "separator",
        {
          label: "Sign out",
          icon: "logout",
          onSelect: async () => {
            if (state.timer && !(await confirmDialog({ title: "Sign out with a running timer?", message: "The timer stays saved on this device and resumes when you sign back in.", confirmLabel: "Sign out", tone: "primary" }))) return;
            signOut();
          },
        },
      ],
      { label: "Account" }
    );
  };

  el.querySelector("[data-account]").addEventListener("click", (event) => accountMenu(event.currentTarget));
  el.querySelector("[data-dock-more]").addEventListener("click", (event) =>
    openMenu(
      event.currentTarget,
      [
        { label: "Subjects", icon: "layers", onSelect: () => navigate("/subjects") },
        { label: "Settings", icon: "settings", onSelect: () => navigate("/settings") },
        "separator",
        { label: "Plan a block", icon: "calendar", onSelect: () => runAction("plan-session") },
        { label: "Log a session", icon: "pencilLine", onSelect: () => runAction("log-session") },
        { label: "New subject", icon: "plus", onSelect: () => runAction("new-subject") },
      ],
      { label: "More", align: "end" }
    )
  );

  const unsubscribe = subscribe((s, keys) => {
    if (keys.has("sync") || keys.has("user")) renderStatus(el);
  });
  const onOnline = () => renderStatus(el);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOnline);
  renderStatus(el);

  return {
    outlet: el.querySelector("[data-outlet]"),
    destroy: () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    },
  };
}

function renderStatus(el) {
  const initial = el.querySelector("[data-avatar-initial]");
  if (initial) initial.textContent = (state.user?.username || "?").slice(0, 1).toUpperCase();

  const sync = el.querySelector("[data-sync]");
  if (!sync) return;
  let tone = "ok";
  let label = "Synced";
  let iconName = "cloud";
  if (state.user?.mode === "local") {
    tone = "dev";
    label = "Dev mode";
    iconName = "monitor";
  } else if (state.sync.error) {
    tone = "error";
    label = "Sync error";
    iconName = "alert";
  } else if (!navigator.onLine) {
    tone = "offline";
    label = "Offline";
    iconName = "cloudOff";
  } else if (state.sync.pendingWrites) {
    tone = "pending";
    label = "Saving…";
  }
  sync.className = `sync sync--${tone}`;
  sync.innerHTML = `${icon(iconName, { size: 14 })}<span class="sync__label">${label}</span>`;
  sync.title = state.sync.error || (tone === "offline" ? "Changes are saved locally and will sync when you reconnect." : label);
}

export function setActiveRoute(el, name) {
  el.querySelectorAll("[data-route]").forEach((link) => {
    const active = link.dataset.route === name;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}
