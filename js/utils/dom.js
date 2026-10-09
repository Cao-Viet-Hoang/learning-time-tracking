/* DOM helpers: safe HTML templating, querying and event delegation. */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Marks a string as trusted HTML so `html` does not escape it. */
class RawHTML {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (value) => new RawHTML(String(value ?? ""));

function stringify(value) {
  if (value == null || value === false || value === true) return "";
  if (Array.isArray(value)) return value.map(stringify).join("");
  if (value instanceof RawHTML) return value.value;
  return esc(value);
}

/**
 * Tagged template that escapes every interpolation unless it is the result of
 * `html` or `raw`. Arrays are joined, null/false/true render nothing.
 */
export function html(strings, ...values) {
  let out = "";
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) out += stringify(values[i]);
  });
  return new RawHTML(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Replaces the content of `el` with the given template result. */
export function render(el, template) {
  if (!el) return;
  el.innerHTML = String(template ?? "");
}

/** Builds a single element from an HTML template. */
export function fragment(template) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(template).trim();
  return tpl.content.firstElementChild;
}

/**
 * Delegated listener: `handler(event, matchedElement)` runs when the event
 * target is inside an element matching `selector` within `root`.
 */
export function on(root, type, selector, handler, options) {
  const listener = (event) => {
    const match = event.target.closest(selector);
    if (match && root.contains(match)) handler(event, match);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

/** Collects named form fields into a plain object (trimmed strings). */
export function formValues(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    data[key] = typeof value === "string" ? value.trim() : value;
  }
  return data;
}

/** Shows inline field errors produced by service validation. */
export function showFieldErrors(form, errors = {}) {
  $$("[data-error-for]", form).forEach((el) => {
    const message = errors[el.dataset.errorFor];
    el.textContent = message || "";
    el.hidden = !message;
    const field = form.elements[el.dataset.errorFor];
    if (field && field.setAttribute) {
      if (message) field.setAttribute("aria-invalid", "true");
      else field.removeAttribute("aria-invalid");
    }
  });
  const firstKey = Object.keys(errors).find((key) => form.elements[key]);
  if (firstKey) form.elements[firstKey].focus?.();
}

/** Toggles a loading state on a button while an async task runs. */
export async function withBusy(button, task) {
  if (!button) return task();
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
  }
}

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
