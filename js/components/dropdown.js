/*
 * Popover menu anchored to a trigger button.
 * Keyboard: arrows move, Enter/Space activate, Escape closes and refocuses.
 *
 * openMenu(trigger, [{ label, icon, onSelect, tone, disabled, hint } | "separator"])
 */

import { icon } from "./icons.js";
import { esc } from "../utils/dom.js";

let current = null;

export function closeMenu() {
  if (!current) return;
  const { el, trigger, cleanup } = current;
  current = null;
  cleanup();
  el.remove();
  trigger.setAttribute("aria-expanded", "false");
}

function position(el, trigger, align) {
  const rect = trigger.getBoundingClientRect();
  const menuRect = el.getBoundingClientRect();
  const margin = 8;
  let top = rect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - margin) top = Math.max(margin, rect.top - menuRect.height - 6);
  let left = align === "start" ? rect.left : rect.right - menuRect.width;
  left = Math.min(Math.max(margin, left), window.innerWidth - menuRect.width - margin);
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

export function openMenu(trigger, items, { align = "end", label = "Actions" } = {}) {
  if (current?.trigger === trigger) {
    closeMenu();
    return;
  }
  closeMenu();

  const el = document.createElement("div");
  el.className = "menu";
  el.setAttribute("role", "menu");
  el.setAttribute("aria-label", label);
  el.innerHTML = items
    .map((item, index) =>
      item === "separator"
        ? `<div class="menu__sep" role="separator"></div>`
        : `<button type="button" role="menuitem" class="menu__item ${item.tone ? `menu__item--${item.tone}` : ""}" data-index="${index}" ${item.disabled ? "disabled" : ""}>
            ${item.icon ? icon(item.icon, { size: 15 }) : ""}
            <span>${esc(item.label)}</span>
            ${item.hint ? `<kbd class="menu__hint">${esc(item.hint)}</kbd>` : ""}
          </button>`
    )
    .join("");
  document.body.append(el);
  position(el, trigger, align);
  trigger.setAttribute("aria-expanded", "true");

  const buttons = () => [...el.querySelectorAll(".menu__item:not(:disabled)")];

  const onClick = (event) => {
    const btn = event.target.closest(".menu__item");
    if (!btn) return;
    const item = items[Number(btn.dataset.index)];
    closeMenu();
    trigger.focus({ preventScroll: true });
    item.onSelect?.();
  };
  const onKey = (event) => {
    const list = buttons();
    const index = list.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu();
      trigger.focus({ preventScroll: true });
    }
  };
  const onOutside = (event) => {
    if (!el.contains(event.target) && !trigger.contains(event.target)) closeMenu();
  };
  const onScroll = () => closeMenu();

  el.addEventListener("click", onClick);
  el.addEventListener("keydown", onKey);
  setTimeout(() => document.addEventListener("pointerdown", onOutside), 0);
  window.addEventListener("resize", onScroll);
  window.addEventListener("scroll", onScroll, true);

  current = {
    el,
    trigger,
    cleanup: () => {
      document.removeEventListener("pointerdown", onOutside);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    },
  };
  buttons()[0]?.focus();
}
