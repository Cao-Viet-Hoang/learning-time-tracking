/*
 * Browser tests for dialog / timer flows, driven with Playwright against the
 * app in local dev mode (no Firestore). Run with `npm run test:e2e`.
 */

import { describe, test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "./server.js";

let server;
let browser;
let page;

before(async () => {
  server = await startServer();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

/** Runs code inside the page with the app's modules. */
const app = (fn, arg) => page.evaluate(fn, arg);
const openDialogs = () => page.locator("dialog[open]").count();
const timerState = () => app(async () => (await import("/js/state.js")).state.timer);

async function signIn() {
  await page.fill('input[name="username"]', "e2e-user");
  await page.click("[data-dev-login]");
  await page.waitForSelector("[data-mini-timer] .mini-timer");
}

async function signOut() {
  await app(async () => (await import("/js/auth.js")).signOut());
  await page.waitForSelector("[data-dev-login]");
}

async function createSubjectDirect(name) {
  await app(async (n) => (await import("/js/services/subjects.js")).createSubject({ name: n }), name);
}

/** Every backend write now resolves only after `ms` (simulates a slow Firestore ack). */
async function slowWrites(ms) {
  await app(async (delay) => {
    const store = (await import("/js/data/db.js")).db();
    for (const method of ["set", "update", "remove", "batch"]) {
      const original = store[method].bind(store);
      store[method] = async (...args) => {
        const result = await original(...args);
        await new Promise((r) => setTimeout(r, delay));
        return result;
      };
    }
  }, ms);
}

async function closeAllDialogs() {
  while (await openDialogs()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}

async function startTimerViaDialog() {
  await page.locator('[data-mini-timer] [data-timer="start"]').first().click();
  await page.waitForSelector("dialog[open] #timer-form");
  const dialog = page.locator("dialog[open]").last();
  const select = dialog.locator('select[name="subjectId"]');
  await select.selectOption(await select.locator("option:not([disabled])").first().getAttribute("value"));
  await dialog.locator('button[type="submit"]').click();
  await page.waitForTimeout(400);
}

/** Pretends the running timer started `minutes` ago. */
async function rewindTimer(minutes) {
  await app(async (m) => {
    const { state } = await import("/js/state.js");
    const { updateTimerDetails } = await import("/js/services/timer.js");
    const ms = m * 60000;
    updateTimerDetails({ startedAt: state.timer.startedAt - ms, runningSince: state.timer.runningSince - ms });
  }, minutes);
}

for (const reducedMotion of ["no-preference", "reduce"]) {
describe(`reduced motion: ${reducedMotion}`, () => {

  beforeEach(async () => {
    page = await browser.newPage({ reducedMotion });
    page.on("pageerror", (error) => assert.fail(`Page error: ${error.message}`));
    await page.goto(server.url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await signIn();
    await createSubjectDirect("Math");
  });

  afterEach(async () => {
    await page?.close();
  });

  test(`start timer opens a single dialog, also after signing in again`, async () => {
    for (const round of ["first sign-in", "second sign-in"]) {
      await startTimerViaDialog();
      assert.ok(await timerState(), `timer started (${round})`);
      assert.equal(await openDialogs(), 0, `no dialog left behind (${round})`);
      await app(async () => (await import("/js/services/timer.js")).discardTimer());
      await signOut();
      await signIn();
    }
  });

  test(`stop with a short session shows one discard confirmation`, async () => {
    await signOut();
    await signIn(); // listeners used to pile up per sign-in
    await startTimerViaDialog();
    await app(() => {
      const button = document.querySelector('[data-mini-timer] [data-timer="stop"]');
      button.click();
      button.click();
    });
    await page.waitForTimeout(300);
    assert.equal(await openDialogs(), 1);
    await closeAllDialogs();
    assert.ok(await timerState(), "cancelling keeps the timer");
    assert.equal(await page.locator('[data-mini-timer] [data-timer="stop"]').first().isEnabled(), true);
  });

  test(`stop & save freezes the clock, locks controls and writes once`, async () => {
    await signOut();
    await signIn();
    await startTimerViaDialog();
    await rewindTimer(5);
    await slowWrites(1500);
    await page.locator('[data-mini-timer] [data-timer="expand"]').first().click();
    const stop = page.locator('dialog[open] .focus [data-timer="stop"]');
    await stop.click();
    await app(() => document.querySelectorAll('[data-timer="stop"]').forEach((b) => b.dispatchEvent(new MouseEvent("click", { bubbles: true }))));

    const clock = page.locator("dialog[open] [data-timer-clock]");
    const before = await clock.textContent();
    await page.waitForTimeout(1200);
    assert.equal(await clock.textContent(), before, "clock is frozen while saving");
    assert.equal(await stop.isDisabled(), true);
    assert.equal(await page.locator('dialog[open] [data-timer="toggle"]').isDisabled(), true);

    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    // Total rather than count: run just after midnight, the 5 minutes are split over two days.
    const total = await app(async () => (await import("/js/state.js")).state.data.learningSessions.reduce((sum, s) => sum + s.durationMinutes, 0));
    assert.equal(total, 5, "saved exactly once");
    assert.equal(await timerState(), null);
  });

  test(`create subject keeps the spinner moving and the button locked until the dialog is gone`, async () => {
    await slowWrites(800);
    await app(async () => (await import("/js/actions.js")).runAction("new-subject"));
    await page.fill('dialog[open] input[name="name"]', "Physics");
    await page.click('dialog[open] button[type="submit"]');

    const spinner = await app(() => {
      const after = getComputedStyle(document.querySelector('dialog[open] button[type="submit"]'), "::after");
      return { name: after.animationName, iterations: after.animationIterationCount };
    });
    assert.deepEqual(spinner, { name: "spin", iterations: "infinite" });

    // Hammer the button and Enter key while saving and while the dialog fades out.
    const samples = [];
    while (await page.locator("dialog").count()) {
      samples.push(
        await app(() => {
          const btn = document.querySelector('dialog button[type="submit"]');
          if (!btn) return null;
          btn.closest("form")?.requestSubmit?.();
          document.querySelector("#subject-form")?.requestSubmit();
          return btn.disabled;
        })
      );
      await page.waitForTimeout(40);
    }
    assert.ok(samples.filter((s) => s !== null).every(Boolean), "button stays disabled until the dialog is removed");
    const names = await app(async () => (await import("/js/state.js")).state.data.subjects.map((s) => s.name));
    assert.deepEqual(names.filter((n) => n === "Physics"), ["Physics"], "subject written once");
  });

  test(`double-clicking a button that opens a dialog leaves it open`, async () => {
    // A real mouse double-click: the 2nd click lands on the freshly opened centred modal's backdrop.
    const box = await page.locator('[data-view-root] [data-action="start-timer"]').first().boundingBox();
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
    assert.equal(await openDialogs(), 1);
  });

  test(`a toast's Undo runs only once`, async () => {
    const calls = await app(async () => {
      const { toast } = await import("/js/components/toast.js");
      let count = 0;
      toast("Deleted", { action: { label: "Undo", onClick: () => count++ } });
      const button = document.querySelector(".toast__action");
      button.click();
      button.click();
      return count;
    });
    assert.equal(calls, 1);
  });

  test(`signing out drops pending Undo toasts`, async () => {
    await app(async () => (await import("/js/components/toast.js")).toast("Session deleted", { duration: 0, action: { label: "Undo", onClick() {} } }));
    await signOut();
    assert.equal(await page.locator(".toast").count(), 0);
  });

  test(`keyboard focus survives the 30s clock re-render`, async () => {
    await page.locator('[data-view-root] [data-action="log-session"]').first().focus();
    await app(async () => (await import("/js/state.js")).setState({ now: Date.now() }));
    await page.waitForTimeout(100);
    const focused = await app(() => document.activeElement?.dataset?.action || document.activeElement?.tagName);
    assert.equal(focused, "log-session");
  });

  test(`stopping a run that crossed midnight saves one session per day`, async () => {
    await startTimerViaDialog();
    await app(async () => {
      const { state } = await import("/js/state.js");
      const { updateTimerDetails } = await import("/js/services/timer.js");
      // Started yesterday at 23:30.
      const d = new Date();
      const startedAt = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 23, 30).getTime();
      updateTimerDetails({ startedAt, runningSince: startedAt, accumulatedMs: 0 });
      return state.timer;
    });
    await page.locator('[data-mini-timer] [data-timer="stop"]').first().click();
    await page.waitForFunction(async () => !(await import("/js/state.js")).state.timer);
    const dates = await app(async () => (await import("/js/state.js")).state.data.learningSessions.map((s) => s.date).sort());
    assert.equal(dates.length, 2);
    assert.notEqual(dates[0], dates[1]);
    assert.match(await page.locator(".toast").last().textContent(), /Split at midnight into 2 sessions/);
  });

  test(`dialog closes with a fade, not an instant pop`, async () => {
    await app(async () => (await import("/js/actions.js")).runAction("new-subject"));
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(60);
    assert.equal(await page.locator("dialog.is-closing").count(), 1, "dialog is still animating out");
    await page.waitForTimeout(300);
    assert.equal(await page.locator("dialog").count(), 0);
  });
});
}
