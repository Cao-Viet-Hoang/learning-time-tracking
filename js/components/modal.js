/*
 * Modal dialogs and drawers built on <dialog>.
 * The native element gives us focus trapping, Escape handling and inert
 * background for free; we add enter/exit transitions and a promise API.
 */

import { icon } from "./icons.js";
import { esc } from "../utils/dom.js";

/**
 * openDialog({ title, description, body, footer, variant, size, onMount, onClose })
 * variant: "modal" (centered) | "drawer" (side panel; bottom sheet on mobile)
 * Returns { el, close, setBusy }.
 */
export function openDialog({
  title = "",
  description = "",
  body = "",
  footer = "",
  variant = "modal",
  size = "md",
  className = "",
  labelledBy = null,
  onMount,
  onClose,
} = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = `dialog dialog--${variant} dialog--${size} ${className}`;
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute("aria-labelledby", labelledBy || titleId);

  dialog.innerHTML = `
    <div class="dialog__panel">
      ${
        title
          ? `<header class="dialog__header">
              <div>
                <h2 class="dialog__title" id="${titleId}">${esc(title)}</h2>
                ${description ? `<p class="dialog__desc">${esc(description)}</p>` : ""}
              </div>
              <button type="button" class="icon-btn dialog__close" data-dialog-close aria-label="Close">${icon("x", { size: 16 })}</button>
            </header>`
          : ""
      }
      <div class="dialog__body">${String(body)}</div>
      ${footer ? `<footer class="dialog__footer">${String(footer)}</footer>` : ""}
    </div>`;

  let closed = false;
  const previouslyFocused = document.activeElement;

  const close = (result) => {
    if (closed) return;
    closed = true;
    dialog.classList.add("is-closing");
    const finish = () => {
      if (dialog.open) dialog.close();
      dialog.remove();
      onClose?.(result);
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.({ preventScroll: true });
    };
    // Reduced motion swaps the slide for a short fade (see components.css), so always wait for it.
    setTimeout(finish, 180);
  };

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  // Click on the backdrop (the dialog element itself, outside the panel) closes it.
  // Ignore the backdrop briefly after opening: the second click of a double-click
  // on the trigger lands on the new backdrop and would close the dialog at once.
  const openedAt = performance.now();
  dialog.addEventListener("mousedown", (event) => {
    if (event.target === dialog && performance.now() - openedAt > 350) dialog.dataset.backdropDown = "1";
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && dialog.dataset.backdropDown) close();
    delete dialog.dataset.backdropDown;
    if (event.target.closest("[data-dialog-close]")) close();
  });

  document.body.append(dialog);
  dialog.showModal();

  const api = {
    el: dialog,
    close,
    setBusy(busy) {
      dialog.querySelectorAll("button, input, select, textarea").forEach((el) => {
        if (busy) {
          el.dataset.wasDisabled = el.disabled ? "1" : "";
          el.disabled = true;
        } else if (el.dataset.wasDisabled !== undefined) {
          el.disabled = el.dataset.wasDisabled === "1";
          delete el.dataset.wasDisabled;
        }
      });
    },
  };

  onMount?.(dialog, api);
  const autofocus = dialog.querySelector("[autofocus]") || dialog.querySelector(".dialog__body input, .dialog__body select, .dialog__body textarea, .dialog__body button");
  autofocus?.focus();
  return api;
}

/** Promise-based confirmation dialog. Resolves true when confirmed. */
export function confirmDialog({ title, message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger" } = {}) {
  return new Promise((resolve) => {
    let result = false;
    openDialog({
      title,
      size: "sm",
      className: "dialog--confirm",
      body: message ? `<p class="confirm__message">${esc(message)}</p>` : "",
      footer: `
        <button type="button" class="btn btn--ghost" data-dialog-close>${esc(cancelLabel)}</button>
        <button type="button" class="btn btn--${tone === "danger" ? "danger" : "primary"}" data-confirm autofocus>${esc(confirmLabel)}</button>`,
      onMount: (el, api) => {
        el.querySelector("[data-confirm]").addEventListener("click", () => {
          result = true;
          api.close();
        });
      },
      onClose: () => resolve(result),
    });
  });
}
