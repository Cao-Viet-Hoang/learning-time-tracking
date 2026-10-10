# Cadence — Learning Time Tracker

A focused workspace for **planning, tracking and reviewing learning time**.

**Plan → Learn → Track → Review → Adjust**

Built with plain **HTML, CSS and vanilla JavaScript (ES modules)**. There's no framework and no build step, and **Firebase Firestore** stores the data.

## Run locally

ES modules don't load from `file://`, so serve the folder with any static server:

```bash
# Python
python -m http.server 5173
# or Node
npx serve .
```

Then open <http://localhost:5173>.

### Sign in

| Field | Value |
|---|---|
| Username | any name; all your data is scoped to it (`userId`) |
| Key | the Firebase **Web API key** of the project |

The key is checked against a SHA-256 fingerprint in `firebase-config.js`, so the check works offline. On success the session is remembered on that device.

**Local dev mode** (a button on the sign-in screen) runs the whole app without Firestore. Data stays in that browser's `localStorage`. You can turn it off with `devModeEnabled = false`.

### Demo data

Go to **Settings → Development utilities → Load demo data**. This generates 4 subjects, goals, about 4 months of sessions and upcoming plans. Demo records are tagged `demo: true`, and **Remove demo data** deletes only those records.

## Tests

The app itself needs no install. `package.json` only exists for the test tooling.

```bash
npm install          # Playwright, for the browser tests
npm test             # unit tests (node:test): utils, services, timer, against the local backend
npm run test:e2e     # browser tests (Playwright + Chromium) for dialogs, timer and toasts
```

`test/unit/` imports the app's ES modules directly in Node, with small browser shims in `setup.js`. `test/e2e/` serves the folder with a tiny Node server and drives the app in local dev mode. It runs every flow twice, with and without `prefers-reduced-motion`. If Chromium is missing, run `npx playwright install chromium`.

## Features

- **Today**: progress toward the daily goal, a central timeline (planned / completed / in progress / missed / unplanned sessions, plus a "now" marker), month and year pace (ahead / on track / behind, with "expected by today"), streak, and per-subject goals.
- **Planner**: a week strip, an hour-grid day canvas (click an empty slot to plan a block; Plan and Actual are shown side by side), a timeline view, a month calendar, planned-vs-actual table, duplicate to next day/week, and copy the previous day.
- **Timer**: start, pause, resume and stop. A mini timer stays in the top bar (or the mobile dock), and there's an expanded focus mode. It's saved in `localStorage`, so it survives navigation, reloads and multiple tabs. Only the finished session is written to Firestore. A run that crosses midnight is saved as one session per day (in one batch), so each day's goal and streak get their share.
- **Manual sessions**: same shape as timer sessions (`source: "manual"`), and they go through the same analytics.
- **History**: grouped by day, with search, subject / date range / source filters, sort, inline details, edit, and delete with undo.
- **Subjects**: create, edit, archive and restore, plus stats and a detail drawer. Archived subjects keep their history but can't be selected for new plans or sessions.
- **Goals**: daily, monthly and yearly, plus optional monthly goals per subject.
- **Insights**: weekly/monthly review, a 12-month heatmap, time distribution, consistency, and learning patterns (peak hours, most active / most consistent weekday, average session).
- Light and dark mode, responsive layout (bottom dock on mobile), and keyboard shortcuts: `T` timer, `Space` pause, `P` plan, `L` log, `1–6` sections, `/` search.

## Project structure

```text
index.html
firebase-config.js            Firebase project config (no API key) + flags
firebase-config.example.js    Template for another project
firestore.rules               Suggested security rules
css/
  reset.css  variables.css (design tokens)  components.css  app.css (shell)  views.css
js/
  app.js        Entry: boot, auth switch, keyboard shortcuts
  auth.js       Sign-in / sign-out / session restore (swap in Firebase Auth here)
  state.js      Small observable store
  router.js     Hash router
  shell.js      Top bar, mobile dock, sync status
  actions.js    Global data-action dispatcher
  theme.js
  data/         db.js (facade + live listeners), firestoreBackend.js, localBackend.js
  services/     subjects, goals, plannedSessions, learningSessions, timer (validation + writes)
  domain/       selectors, goals (pace), plans (planned vs actual), analytics, review
  components/   modal, dropdown, toast, tooltip, timer, timeline, heatmap, charts, progress, ui, icons
  forms/        subject, plan, session, goals forms + shared fields/submit
  views/        dashboard, planner, history, analytics, subjects, settings, login
  dev/seed.js   Demo data (development only)
```

The layers are: **views → domain (read-only calculations) / services (validated writes) → data (backend)**. Analytics are always computed from the source records and are never stored.

## Data model (Firestore)

All documents carry `userId`. Every query is `where("userId", "==", userId)`.

| Collection | Fields |
|---|---|
| `users/{userId}` | `username, lastSignInAt` |
| `subjects` | `name, description, icon, color, archived, createdAt, updatedAt` |
| `goals` | `type (daily/monthly/yearly), subjectId (null = overall), targetMinutes` |
| `plannedSessions` | `date, startTime, endTime, subjectId, topic, note, status (planned/completed/skipped)` |
| `learningSessions` | `date, startTime, endTime, durationMinutes, subjectId, topic, note, source (timer/manual), plannedSessionId` |

Display states such as *missed*, *partial* and *in progress* are derived at render time, not stored.

## Security note

The current sign-in (username + API key) is not real authentication. A Firebase web API key is public by design, so Firestore rules can't tell users apart. `firestore.rules` restricts collections and validates document shape. For real per-user isolation:

1. Enable an Authentication provider in the Firebase Console.
2. In `js/auth.js`, call the Firebase Auth SDK and use `user.uid` as the `userId`.
3. Change `validUser()` in `firestore.rules` to check `request.auth.uid`.

Services and views don't need to change.
