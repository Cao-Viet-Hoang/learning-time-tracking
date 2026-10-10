/* Toast notifications (polite live region; errors are assertive). */

import { icon } from "./icons.js";
import { esc } from "../utils/dom.js";
import { describeError } from "../utils/errors.js";

const TONE_ICON = { success: "checkCircle", error: "alert", info: "info", warning: "alert" };
let region = null;

function ensureRegion() {
  if (region) return region;
  region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("role", "region");
  region.setAttribute("aria-label", "Notifications");
  document.body.append(region);
  return region;
}

/**
 * toast("Saved", { tone: "success", action: { label: "Undo", onClick } })
 */
export function toast(message, { tone = "info", duration = 4200, action = null, description = "" } = {}) {
  const host = ensureRegion();
  const el = document.createElement("div");
  el.className = `toast toast--${tone}`;
  el.setAttribute("role", tone === "error" ? "alert" : "status");
  el.innerHTML = `
    <span class="toast__icon">${icon(TONE_ICON[tone] || "info", { size: 16 })}</span>
    <div class="toast__body">
      <p class="toast__title">${esc(message)}</p>
      ${description ? `<p class="toast__desc">${esc(description)}</p>` : ""}
    </div>
    ${action ? `<button type="button" class="toast__action">${esc(action.label)}</button>` : ""}
    <button type="button" class="toast__close" aria-label="Dismiss notification">${icon("x", { size: 14 })}</button>`;

  let timer;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    el.classList.add("is-leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  const arm = () => {
    clearTimeout(timer);
    if (duration) timer = setTimeout(close, duration);
  };

  el.querySelector(".toast__close").addEventListener("click", close);
  el.querySelector(".toast__action")?.addEventListener("click", () => {
    // The toast stays clickable while it animates out; the action must only run once.
    if (closed) return;
    close();
    action.onClick();
  });
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", arm);
  el.addEventListener("focusin", () => clearTimeout(timer));

  host.append(el);
  while (host.children.length > 4) host.firstElementChild.remove();
  arm();
  return close;
}

/** Drops every toast, e.g. on sign-out so an "Undo" can't act on the next user's data. */
export function clearToasts() {
  region?.replaceChildren();
}

export const toastSuccess = (message, options) => toast(message, { tone: "success", ...options });
export const toastError = (errorOrMessage, options) =>
  toast(typeof errorOrMessage === "string" ? errorOrMessage : describeError(errorOrMessage), { tone: "error", duration: 7000, ...options });
