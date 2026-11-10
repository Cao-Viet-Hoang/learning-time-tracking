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

/* ---------- In-place patching (no flicker) ---------- */

const KEY_ATTRS = ["id", "data-plan-id", "data-session-id", "data-subject-id", "data-date"];

function keyOf(node) {
  if (node.nodeType !== 1) return null;
  for (const name of KEY_ATTRS) {
    const value = node.getAttribute(name);
    if (value) return `${node.nodeName}|${name}=${value}`;
  }
  return null;
}

const sameKind = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;

function syncAttributes(from, to) {
  for (const { name } of [...from.attributes]) {
    if (!to.hasAttribute(name)) from.removeAttribute(name);
  }
  for (const { name, value } of [...to.attributes]) {
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
}

function syncFormState(from, to) {
  if (from === document.activeElement) return; // never overwrite what the user is typing
  const tag = from.nodeName;
  if (tag === "INPUT") {
    if (from.type === "checkbox" || from.type === "radio") from.checked = to.hasAttribute("checked");
    else if (from.value !== (to.getAttribute("value") ?? "")) from.value = to.getAttribute("value") ?? "";
  } else if (tag === "TEXTAREA") {
    if (from.value !== to.value) from.value = to.value;
  } else if (tag === "OPTION") {
    from.selected = to.hasAttribute("selected");
  }
}

function morphNode(from, to) {
  if (from.nodeType !== 1) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  syncAttributes(from, to);
  syncFormState(from, to);
  // The live timer clock is owned by the ticker; leave its text alone.
  if (from.hasAttribute("data-timer-clock")) return;
  morphChildren(from, to);
}

function morphChildren(from, to) {
  const oldKids = [...from.childNodes];
  const keyed = new Map();
  for (const kid of oldKids) {
    const key = keyOf(kid);
    if (key && !keyed.has(key)) keyed.set(key, kid);
  }
  const used = new Set();
  let ref = from.firstChild;

  for (const next of [...to.childNodes]) {
    const key = keyOf(next);
    let match = null;
    if (key) {
      match = keyed.get(key);
      if (match && used.has(match)) match = null;
    } else {
      while (ref && used.has(ref)) ref = ref.nextSibling;
      for (let cand = ref; cand; cand = cand.nextSibling) {
        if (!used.has(cand) && !keyOf(cand) && sameKind(cand, next)) {
          match = cand;
          break;
        }
      }
    }
    if (match) {
      used.add(match);
      if (match === ref) ref = ref.nextSibling;
      else from.insertBefore(match, ref);
      morphNode(match, next);
    } else {
      from.insertBefore(next, ref);
      used.add(next);
    }
  }
  for (const kid of oldKids) if (!used.has(kid)) kid.remove();
}

/**
 * Like `render`, but diffs the new markup against the existing DOM and only
 * touches what changed. Unchanged elements stay in place, so there is no
 * flicker, CSS animations don't replay, progress bars transition smoothly,
 * and focus/scroll/hover survive live updates.
 */
export function patch(el, template) {
  if (!el) return;
  const tpl = document.createElement("template");
  tpl.innerHTML = String(template ?? "");
  morphChildren(el, tpl.content);
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

/**
 * Toggles a loading state on a button while an async task runs.
 * keepOnSuccess leaves the button locked after success, for callers that are
 * about to close or replace it (re-enabling it would invite a second submit).
 */
export async function withBusy(button, task, { keepOnSuccess = false } = {}) {
  if (!button) return task();
  const reset = () => {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
  };
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  try {
    const result = await task();
    if (!keepOnSuccess) reset();
    return result;
  } catch (error) {
    reset();
    throw error;
  }
}

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
