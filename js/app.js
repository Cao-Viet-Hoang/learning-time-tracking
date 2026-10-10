/*
 * Entry point: boots theme & global UI, restores the session, then swaps
 * between the sign-in screen and the authenticated shell.
 */

import { state, setState, subscribe } from "./state.js";
import { restoreSession } from "./auth.js";
import { setBackgroundErrorHandler } from "./data/db.js";
import { initTimer } from "./services/timer.js";
import { applyTheme } from "./theme.js";
import { renderShell, setActiveRoute } from "./shell.js";
import { renderLogin } from "./views/login.js";
import { startRouter, stopRouter, navigate, ROUTES } from "./router.js";
import { initActions, runAction } from "./actions.js";
import { initTimerUI, openStartTimer, openFocusTimer, toggleTimer } from "./components/timer.js";
import { initTooltips } from "./components/tooltip.js";
import { toastError, clearToasts } from "./components/toast.js";
import { isTypingTarget } from "./utils/dom.js";
import { getPrefs } from "./utils/storage.js";
import { describeError } from "./utils/errors.js";

import * as dashboard from "./views/dashboard.js";
import * as planner from "./views/planner.js";
import * as history from "./views/history.js";
import * as analytics from "./views/analytics.js";
import * as subjects from "./views/subjects.js";
import * as settings from "./views/settings.js";

const VIEWS = { home: dashboard, planner, history, insights: analytics, subjects, settings };

const appEl = document.getElementById("app");
let shell = null;

function showSignedIn() {
  if (shell) return;
  appEl.classList.remove("is-auth");
  shell = renderShell(appEl);
  initTimer();
  initTimerUI();
  // Resume the last visited section when opening the app without a hash.
  if (!location.hash) restoreLastRoute();
  startRouter({
    el: shell.outlet,
    viewMap: VIEWS,
    onRouteChange: (route) => setActiveRoute(appEl, route.name),
  });
}

function restoreLastRoute() {
  const saved = getPrefs().lastRoute || "#/";
  window.history.replaceState(null, "", saved.startsWith("#/") ? saved : "#/");
}

function showSignedOut() {
  stopRouter();
  shell?.destroy();
  shell = null;
  // Open dialogs and "Undo" toasts belong to the previous user's session.
  clearToasts();
  document.querySelectorAll("dialog").forEach((d) => d.remove());
  appEl.classList.add("is-auth");
  renderLogin(appEl);
}

function onKeydown(event) {
  if (state.authStatus !== "signed-in" || event.metaKey || event.ctrlKey || event.altKey) return;
  if (isTypingTarget(event.target) || document.querySelector("dialog[open]") || document.querySelector(".menu")) return;
  const key = event.key.toLowerCase();
  if (key === "t") {
    event.preventDefault();
    state.timer ? openFocusTimer() : openStartTimer();
  } else if (key === " " && state.timer && !event.target.closest("button, a")) {
    event.preventDefault();
    toggleTimer();
  } else if (key === "p") {
    event.preventDefault();
    runAction("plan-session", document.querySelector("[data-context-date]") || document.body);
  } else if (key === "l") {
    event.preventDefault();
    runAction("log-session", document.querySelector("[data-context-date]") || document.body);
  } else {
    const route = ROUTES.find((r) => r.key === event.key);
    if (route) navigate(route.path);
  }
}

async function boot() {
  applyTheme();
  initTooltips();
  initActions();
  setBackgroundErrorHandler((message) => toastError(message));
  document.addEventListener("keydown", onKeydown);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());

  // Coarse clock: keeps "now" markers, missed/upcoming states and dates fresh.
  setInterval(() => setState({ now: Date.now() }), 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setState({ now: Date.now() });
  });

  subscribe((s, keys) => {
    if (!keys.has("authStatus")) return;
    if (s.authStatus === "signed-in") showSignedIn();
    else if (s.authStatus === "signed-out") showSignedOut();
  });

  try {
    const restored = await restoreSession();
    if (!restored) setState({ authStatus: "signed-out" });
  } catch (error) {
    setState({ authStatus: "signed-out" });
    queueMicrotask(() => toastError(`Couldn't restore your session: ${describeError(error)}`));
  }
}

window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  toastError(event.reason);
});

boot();
