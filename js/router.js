/*
 * Hash router: "#/planner?date=2026-10-08".
 * Each route maps to a view module exposing `mount(el, params) → unmount`.
 * Views own their region; the timer and dialogs live outside it, so
 * navigation never interrupts them.
 */

import { setPref } from "./utils/storage.js";

export const ROUTES = [
  { path: "/", name: "home", label: "Today", icon: "home", key: "1" },
  { path: "/planner", name: "planner", label: "Planner", icon: "calendar", key: "2" },
  { path: "/history", name: "history", label: "History", icon: "history", key: "3" },
  { path: "/insights", name: "insights", label: "Insights", icon: "chart", key: "4" },
  { path: "/subjects", name: "subjects", label: "Subjects", icon: "layers", key: "5" },
  { path: "/settings", name: "settings", label: "Settings", icon: "settings", key: "6" },
];

let views = {};
let outlet = null;
let unmount = null;
let currentKey = "";
let onChange = () => {};

export function parseHash(hash = location.hash) {
  const clean = hash.replace(/^#/, "") || "/";
  const [path, query = ""] = clean.split("?");
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];
  return { route, params: Object.fromEntries(new URLSearchParams(query)) };
}

export function buildHash(path, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
  return `#${path}${query ? `?${query}` : ""}`;
}

export function navigate(path, params = {}, { replace = false } = {}) {
  const hash = buildHash(path, params);
  if (hash === location.hash) return;
  if (replace) {
    history.replaceState(null, "", hash);
    resolve();
  } else location.hash = hash;
}

/** Updates query params of the current route without remounting the view. */
export function updateParams(params) {
  const { route, params: current } = parseHash();
  const next = Object.fromEntries(Object.entries({ ...current, ...params }).filter(([, v]) => v != null && v !== ""));
  const hash = buildHash(route.path, next);
  history.replaceState(null, "", hash);
  currentKey = `${route.path}?${new URLSearchParams(next)}`;
  setPref("lastRoute", hash);
}

async function resolve() {
  if (!outlet) return;
  const { route, params } = parseHash();
  const key = `${route.path}?${new URLSearchParams(params)}`;
  if (key === currentKey && unmount) return;
  const sameView = currentKey.split("?")[0] === route.path && unmount;
  currentKey = key;
  setPref("lastRoute", location.hash || "#/");

  if (sameView && typeof unmount.update === "function") {
    unmount.update(params);
    onChange(route, params);
    return;
  }

  try {
    unmount?.();
  } catch (error) {
    console.error("View unmount failed", error);
  }
  unmount = null;
  outlet.innerHTML = "";
  outlet.dataset.view = route.name;
  outlet.classList.remove("is-entering");
  void outlet.offsetWidth;
  outlet.classList.add("is-entering");

  const view = views[route.name];
  unmount = view.mount(outlet, params) || (() => {});
  onChange(route, params);
  window.scrollTo({ top: 0 });
}

export function startRouter({ el, viewMap, onRouteChange }) {
  outlet = el;
  views = viewMap;
  onChange = onRouteChange || onChange;
  window.addEventListener("hashchange", resolve);
  resolve();
}

export function stopRouter() {
  window.removeEventListener("hashchange", resolve);
  try {
    unmount?.();
  } catch {
    /* ignore */
  }
  unmount = null;
  currentKey = "";
  if (outlet) outlet.innerHTML = "";
}
