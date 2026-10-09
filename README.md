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

## Features

- **Today**: progress toward the daily goal, a central timeline (planned / completed / in progress / missed / unplanned sessions, plus a "now" marker), month and year pace (ahead / on track / behind, with "expected by today"), streak, and per-subject goals.
- **Planner**: a week strip, an hour-grid day canvas (click an empty slot to plan a block; Plan and Actual are shown side by side), a timeline view, a month calendar, planned-vs-actual table, duplicate to next day/week, and copy the previous day.
- **Timer**: start, pause, resume and stop. A mini timer stays in the top bar (or the mobile dock), and there's an expanded focus mode. It's saved in `localStorage`, so it survives navigation, reloads and multiple tabs. Only the finished session is written to Firestore.
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

Each user's data is nested under their own `users/{userId}` document, so
isolation comes from the document path, not a filtered query.

| Collection | Fields |
|---|---|
| `users/{userId}` | `username, lastSignInAt` |
| `users/{userId}/subjects` | `name, description, icon, color, archived, createdAt, updatedAt` |
| `users/{userId}/goals` | `type (daily/monthly/yearly), subjectId (null = overall), targetMinutes` |
| `users/{userId}/plannedSessions` | `date, startTime, endTime, subjectId, topic, note, status (planned/completed/skipped)` |
| `users/{userId}/learningSessions` | `date, startTime, endTime, durationMinutes, subjectId, topic, note, source (timer/manual), plannedSessionId` |

`userId` is bound once when the Firestore backend connects (see
`js/data/firestoreBackend.js`); services just pass bare collection names
("subjects", "goals", ...) and the backend resolves the nested path.

Display states such as *missed*, *partial* and *in progress* are derived at render time, not stored.

## Security note

The current sign-in (username + API key) is not real authentication. A Firebase web API key is public by design, so Firestore rules can't tell *who* is writing. Isolation between users is structural (separate `users/{userId}` subtrees), not enforced — anyone with the API key could technically read/write under any userId. `firestore.rules` only validates document shape to block malformed writes. This is an accepted tradeoff for a small app with a few known users. For real per-user enforcement:

1. Enable an Authentication provider in the Firebase Console.
2. In `js/auth.js`, call the Firebase Auth SDK and use `user.uid` as the `userId`.
3. Add a check in `firestore.rules` that `request.auth.uid == userId` on the `users/{userId}` match.

Services and views don't need to change.
