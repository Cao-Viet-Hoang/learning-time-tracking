/* Sign-in screen: username + Firebase API key, with an optional local dev mode. */

import { html, raw, render, formValues, withBusy } from "../utils/dom.js";
import { icon } from "../components/icons.js";
import { signIn, signInDevMode, isDevModeAvailable, lastUsername } from "../auth.js";
import { describeError, AuthError } from "../utils/errors.js";
import { firebaseConfig } from "../../firebase-config.js";

export function renderLogin(el) {
  render(
    el,
    html`<main class="auth" id="main">
      <div class="auth__panel">
        <div class="brand brand--lg">
          <span class="brand__mark" aria-hidden="true"><span></span><span></span><span></span></span>
          <span class="brand__name">Cadence</span>
        </div>
        <h1 class="auth__title">Sign in to your learning workspace</h1>
        <p class="auth__sub">Plan, track and review the time you invest in learning.</p>

        <form class="form auth__form" novalidate>
          <div class="form-banner" data-form-banner role="alert" hidden></div>
          <div class="field">
            <label class="field__label" for="f-username">Username</label>
            <div class="input-icon">
              ${raw(icon("user", { size: 15 }))}
              <input class="input" id="f-username" name="username" autocomplete="username" value="${lastUsername()}" placeholder="e.g. hoang" maxlength="40" required>
            </div>
            <p class="field__hint">Your data is stored under this name.</p>
            <p class="field__error" data-error-for="username" hidden></p>
          </div>
          <div class="field">
            <label class="field__label" for="f-apiKey">Key</label>
            <div class="input-icon">
              ${raw(icon("key", { size: 15 }))}
              <input class="input" id="f-apiKey" name="apiKey" type="password" autocomplete="current-password" placeholder="Firebase API key (AIza…)" spellcheck="false" required>
              <button type="button" class="input-icon__toggle icon-btn icon-btn--xs" data-toggle-key aria-label="Show key" aria-pressed="false">${raw(icon("eye", { size: 14 }))}</button>
            </div>
            <p class="field__hint">Firebase Web API key for project <code class="code">${firebaseConfig.projectId}</code>.</p>
            <p class="field__error" data-error-for="apiKey" hidden></p>
          </div>
          <button type="submit" class="btn btn--primary btn--lg btn--block">Sign in${raw(icon("arrowRight", { size: 15 }))}</button>
        </form>

        ${
          isDevModeAvailable()
            ? html`<div class="auth__dev">
                <span>No key? Explore without Firestore.</span>
                <button type="button" class="btn btn--ghost btn--sm" data-dev-login>${raw(icon("monitor", { size: 14 }))}Local dev mode</button>
              </div>`
            : ""
        }
      </div>
      <aside class="auth__aside" aria-hidden="true">
        <div class="auth-preview">
          <p class="eyebrow">Today</p>
          <p class="auth-preview__figure"><span class="mono">1h 24m</span> / 2h</p>
          <div class="progress progress--lg"><div class="progress__fill" style="--progress:70%"></div></div>
          <ol class="auth-preview__tl">
            <li style="--subject:var(--c-orange)"><span class="mono">18:00</span><strong>English</strong><em>Vocabulary</em></li>
            <li style="--subject:var(--c-blue)"><span class="mono">19:00</span><strong>Embedded C</strong><em>Function Pointer</em></li>
            <li style="--subject:var(--c-aqua)"><span class="mono">20:15</span><strong>AI / LLM</strong><em>MCP Architecture</em></li>
          </ol>
          <p class="auth-preview__loop">Plan → Learn → Track → Review → Adjust</p>
        </div>
      </aside>
    </main>`
  );

  const form = el.querySelector("form");
  const banner = el.querySelector("[data-form-banner]");
  const showError = (error) => {
    el.querySelectorAll("[data-error-for]").forEach((e) => {
      e.hidden = true;
      e.textContent = "";
    });
    form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    if (error instanceof AuthError && error.field) {
      const slot = el.querySelector(`[data-error-for="${error.field}"]`);
      slot.textContent = error.message;
      slot.hidden = false;
      form.elements[error.field].setAttribute("aria-invalid", "true");
      form.elements[error.field].focus();
      banner.hidden = true;
    } else {
      banner.textContent = describeError(error);
      banner.hidden = false;
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(form);
    try {
      await withBusy(form.querySelector('[type="submit"]'), () => signIn(values));
    } catch (error) {
      if (!(error instanceof AuthError)) console.error(error);
      showError(error);
    }
  });

  el.querySelector("[data-toggle-key]").addEventListener("click", (event) => {
    const btn = event.currentTarget;
    const input = form.elements.apiKey;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Hide key" : "Show key");
    btn.innerHTML = icon(show ? "eyeOff" : "eye", { size: 14 });
  });

  el.querySelector("[data-dev-login]")?.addEventListener("click", async (event) => {
    try {
      await withBusy(event.currentTarget, () => signInDevMode({ username: form.elements.username.value }));
    } catch (error) {
      showError(error);
    }
  });

  (form.elements.username.value ? form.elements.apiKey : form.elements.username).focus();
}
