/*
 * Global tooltip driven by `data-tip` attributes (text) or `data-tip-html`
 * (pre-escaped markup). Works on hover and keyboard focus.
 */

let tip = null;
let anchor = null;

function ensure() {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "tooltip";
  tip.setAttribute("role", "tooltip");
  tip.id = "global-tooltip";
  document.body.append(tip);
  return tip;
}

function show(target) {
  const el = ensure();
  const htmlContent = target.getAttribute("data-tip-html");
  if (htmlContent) el.innerHTML = htmlContent;
  else el.textContent = target.getAttribute("data-tip");
  anchor = target;
  el.classList.add("is-visible");

  const rect = target.getBoundingClientRect();
  const tipRect = el.getBoundingClientRect();
  let top = rect.top - tipRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.min(Math.max(8, left), window.innerWidth - tipRect.width - 8);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function hide() {
  anchor = null;
  tip?.classList.remove("is-visible");
}

export function initTooltips() {
  const find = (event) => event.target.closest?.("[data-tip], [data-tip-html]");
  document.addEventListener("pointerover", (event) => {
    const target = find(event);
    if (target && target !== anchor) show(target);
    else if (!target && anchor) hide();
  });
  document.addEventListener("focusin", (event) => {
    const target = find(event);
    if (target && target.matches(":focus-visible")) show(target);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  window.addEventListener("scroll", hide, true);
}

export const hideTooltip = hide;
