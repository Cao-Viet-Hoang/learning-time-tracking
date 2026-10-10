import "./setup.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, html, raw, withBusy } from "../../js/utils/dom.js";

/** Just enough of a <button> for withBusy. */
function fakeButton() {
  const classes = new Set();
  const attrs = new Map();
  return {
    disabled: false,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
}

test("html escapes interpolations unless marked raw", () => {
  const name = `<img src=x onerror="alert(1)">`;
  assert.equal(String(html`<p>${name}</p>`), `<p>${esc(name)}</p>`);
  assert.equal(String(html`<p>${raw("<b>ok</b>")}</p>`), "<p><b>ok</b></p>");
  assert.equal(String(html`<p>${null}${false}${["a", "b"]}</p>`), "<p>ab</p>");
});

test("withBusy locks the button while the task runs and resets after", async () => {
  const button = fakeButton();
  let seenWhileRunning;
  const result = await withBusy(button, async () => {
    seenWhileRunning = { disabled: button.disabled, loading: button.classList.contains("is-loading") };
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(seenWhileRunning, { disabled: true, loading: true });
  assert.equal(button.disabled, false);
  assert.equal(button.classList.contains("is-loading"), false);
});

test("withBusy keepOnSuccess leaves the button locked (dialog is about to close)", async () => {
  const button = fakeButton();
  await withBusy(button, async () => "done", { keepOnSuccess: true });
  assert.equal(button.disabled, true);
  assert.equal(button.classList.contains("is-loading"), true);
});

test("withBusy always unlocks on failure so the user can retry", async () => {
  const button = fakeButton();
  const failing = async () => {
    throw new Error("offline");
  };
  await assert.rejects(withBusy(button, failing, { keepOnSuccess: true }), /offline/);
  assert.equal(button.disabled, false);
  assert.equal(button.classList.contains("is-loading"), false);
});
