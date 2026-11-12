# Observation Window — plan to a real first version

Oct 31, 2026 · @Tony · estimate from the repo as it stands, not a measured pace

## Where it stands (2026-11-01)

All ten packages below are built and live on `main` (commit `fffe538`), checked on staging first. The sections after this one are the original plan, kept as history; where they say something was "left out", this section is the current truth. Story numbers (S1.1 and so on) refer to [observation-window-epic.md](observation-window-epic.md).

### Shipped

| Feature | Stories | What exists |
| --- | --- | --- |
| F1 Timeline scrubber | S1.1–S1.8 | Scrub, live pin, playback, click a dot to jump, search (with whole word and next/previous match), widening through WordNet, axis starting at the first item |
| F2 Lanes and injection | S2.2–S2.4, S2.6, S2.7 | Lanes on one axis, collapsible groups, solo, one outside-your-interests pick a day from a seven-feed pool, labelled with why, dismissable |
| F2 (partly) | S2.1 | Sources and whole groups can be switched on and off, kept in the browser only. **Not built:** adding a feed by pasting its address. In its place, a "Suggest a source" form that emails the operator |
| F3 Timing correlation | S3.1–S3.4 | Everything within an adjustable window shown together, overflow counted ("+N more"), "Co-occurrence is not a link" |
| F9 Collection (enabler) | S9.1, S9.3, S9.4, S9.7–S9.9 | Hourly cloud collector, one shared de-duplicated store, 30-day expiry, daily per-source counts kept, collector gaps shown as hatching |
| Privacy | (not a story) | "How it works" copy, an Account section and an on-page footer saying what is and isn't stored, and buttons that clear what the browser remembers |
| F8 Handoff to Orient (Release 2, first part) | S8.1, S8.2 (partly), S8.5 | **Orient on this moment** sends the cards on screen (up to 12) to Orient as Current Events, listed apart from the Context box with a remove button on each. The server stores them on the Session and the Guide skips its Tavily search when they are present; without them it works as before. Seen working on staging 2026-11-05. The open case and hypothesis go along as the start of the Context (S8.2). **Not built:** nothing more of F8 |
| F4 Cases (first part) | S4.1, S4.2, S4.7, S4.8, S8.3, S8.4 | Open a case with your own words (nothing filled in for you), edit the hypothesis, switch between open cases, close and reopen (asks nothing), delete one or all. Cases and their timestamps live in two owner-only tables (`Case`, `CycleEvent`); the timestamps table holds only case id, what happened and when. The case shows "N days to orient / to decide". The "How it works", Account and page-footer copy now say cases are stored. |
| F4 Tags and tally | S4.3, S4.4, S4.5 | Cards that look relevant to the open case are marked "proposed" with the case words that matched; the user taps Supports, Cuts against or Not relevant, can flip or clear, and can tag any card. The tally counts the user's sorted evidence up to the scrubber, plus relevant items not sorted yet, counts only. Closing the case hides all of it. Stored in a third owner-only table (`CaseTag`: case id, item id, item time, stance). **Different from the epic's wording:** matching words can show relevance but not direction, so the Window never proposes supports or cuts against; that is always the user's. **Not built:** the rival hypothesis (S4.6), which needs more than word matching |
| F4 Rival hypothesis | S4.6 | **Suggest a rival explanation** on an open case, on request only. It sends the case title, the hypothesis and up to 12 items (the ones sorted first, then relevant unsorted ones) to a small model (Haiku) in a Lambda, and gets back one rival plus the items it fits (at least three). The user keeps it as a second hypothesis (saved on the case as their own text) or dismisses it; the suggestion is never stored. Capped at 5 a day per person and $2 a month for everyone, counted apart from the Guide's budget and refunded when no usable answer comes back. **Different from the epic's wording:** it is offered on request, not triggered by a lopsided tally, and says it is a question to test, not a verdict. Seen working on staging 2026-11-10. |
| F5 Stakes (first part) | S5.1, S5.2 | With a case open, every card shows **Stakes 0 to 3 of 3** and why, from plain rules over the user's own case words: 1 looks relevant, 2 matches a word of the case title or three or more case words, 3 the user tagged it, 0 marked not relevant or no match. The user can set any item's stakes by hand (0 to 3, "Use the rules" undoes it), and a hand-set number always wins. Stakes order the cards (after outside-interest picks and related-not-exact) and make 2s and 3s bigger on the timeline. A hand-set number is stored on the item's `CaseTag` row (case id, item id, time, stance, stakes), still no words; closing the case or switching cases reweights. **Not built:** "only the top 5 get titles" (waits for S2.5), and stakes for items you haven't opened a case for. Not yet seen on staging. |
| F5 Baselines | S5.3 | A **Volume against normal** panel under the timeline says how many lanes are busier or quieter than normal for the window on screen, and lists every lane with its count, its normal and a bar with a tick at normal. Normal is a source's average items per day over the complete days since the collector's first run (counts from before that are archive items, not real volume), leaving out the days the window covers, scaled to the window's length. Busier is at least double normal and at least 2 items; quieter is half or less for a lane that usually gives 3 or more. Below 7 such days it says there isn't enough history yet. Reads the daily counts that outlive the items; no new tables. **Different from the epic's wording:** compared against the window you're looking at, not by calendar month, and one panel rather than a strip on every lane. No weekend adjustment yet. Not yet seen on staging. |
| F5 Expected events and absences | S5.4, S5.5 | Per case, the user registers an event they expect each month: a name, the words an item about it would hold, a day of the month and give-or-take days (up to 7). An item counts when it holds every word, **from any source**, inside those days. Once the last allowed day has passed with no match, the event shows as a hollow marker in an "Expected, didn't happen" row on the timeline and, when the scrubber is near, a dashed card reading "Expected, didn't happen". Only months the collector fully covered (after its first run, within the 30 days items are kept, with no collector gap) can be called missing. The case panel lists each event with its last result and next expected day. Stored in a fifth owner-only table (`ExpectedEvent`); deleting a case or all cases deletes them. **Different from the epic's wording:** no lane (matching is on words from any source, per Tony), so the hollow marker sits in its own row, not a lane. Monthly only, and the check reaches back at most 30 days, so one month at a time for now. Not yet seen on staging. |
| Operations | | Alarms for the collector (errors, silence) and for widen-search; `npm run smoke-observation`; history import script; playbook notes |

### Not built yet, from the first release's own list

- **S2.5 Dense lanes stay readable.** Every dot is drawn and only the cards carry titles; the "top 5 get titles" rule isn't there.
- **S2.8 Reorder** and **S2.9 Remove a source.** The feed list is edited in code (`amplify/feeds.ts`); a retired feed just shows "(retired)" until its items expire.
- **S9.2 Cadence per source** and **S9.6 Degrade before stopping.** Every feed is fetched hourly.
- **S9.5 Background cost cap.** There is no separate collection budget. Cost is small and the existing $30 AWS ceiling would catch a surprise, but nothing is capped.

### Next, in the epic's order

1. **Release 2.** The handoff itself is built (see Shipped). The first slice of F4 and the cycle time are built too. The rival hypothesis (S4.6) is built and seen working on staging. F5 stakes (S5.1, S5.2) are built, pending a check on staging. Baselines (S5.3) are built, pending a check on staging. Expected events and absences (S5.4, S5.5) are built, pending a check on staging. That completes F5 apart from title visibility (S2.5).
2. **Release 3.** F6 entities, pattern signatures, source trust and a map; F7 field notes and others' journals.
3. **User-added sources.** S2.1 proper (paste an address), S2.8 and S2.9 need a per-user list of sources, which changes the privacy promise that nothing about a user is stored. Worth doing only if people keep asking through the suggestion box.

### Open items

- **Real-use check.** Nobody has signed in to staging or `main` and used the Observe tab with real data yet. Do this before anything else.
- **Nov 21 self-test.** Pass criterion in `prototype/observation-window/README.md`: name one moment the window changed what you'd do.
- **Laptop collector.** Still running hourly from this worktree. It is now the only source for Fierce Network and RCR Wireless, which AWS can't fetch. Stop it (README has the commands) once the cloud history is enough.
- **Sandboxes.** `observation` keeps collecting hourly (`npx ampx sandbox delete --identifier observation` when done). The original `tonyreynolds` sandbox is stuck in UPDATE_FAILED and can't be rolled back; redeploying under a new identifier replaced it.
- **Rival hypothesis limits.** 5 a day per person and $2 a month are first guesses (`RIVAL_DAILY_LIMIT`, `RIVAL_MONTHLY_BUDGET_USD` in `amplify/config.ts`). Revisit after real use.
- **Epic open questions still open:** the paid-search cap (decide after a month of use), how rule-based stakes work, and how the tarot's patterns become matchable signals. Case deletion against cycle timestamps is answered for now by a default: deleting a case deletes its timestamps too (the page says so). Revisit if you'd rather keep timestamps for the measurement.

---

## The original plan (kept for history)

## Scope of the first real version

- **Users:** Tony and a few friends, signing in with the existing invite keys.
- **Sources:** a fixed starter list (the 23 feeds in `prototype/observation-window/feeds.json`, edited as wanted). No adding, removing, reordering or switching off sources yet.
- **Included:** the scrubber, groups, solo, search, widening, playback, the daily outside-interest injection, 30-day retention with per-source daily counts, and an hourly cloud collector.
- **Left out for now:** add-a-feed by address (S2.1, S2.8, S2.9), cases and stakes (F4, F5), entities, map, field notes (F6, F7), the tarot handoff (F8), and paid search.
- **Assumptions to correct if wrong:** dismissing an injected source is remembered in the browser only; there is no per-user source table, just one shared set of feeds.

## Packages

A session is one focused sitting of about 2 to 3 hours, including tests and a deploy check. Ranges are plus or minus 40%.

| Package | What | Sessions |
| --- | --- | --- |
| A. Shell | A second app inside the site, navigation, landing and title copy | 1–2 |
| B. Data | Shared feed and item tables with 30-day expiry, daily counts, a run log, the starter list seeded | 1–2 |
| C. Collector | Hourly Lambda: fetch each feed once, dedupe, count, log gaps, alarm on failure | 3–4 |
| E. Scrubber port | Timeline, groups, solo, search, widening, cards and playback as React, with tests | 5–7 |
| G. Widening service | WordNet lookup in a Lambda | 1–2 |
| H. Injection | Curated pool, a daily pick per user, labels | 1–2 |
| I. Privacy | "How it works" copy for stored feeds, delete-my-history | 1 |
| J. Hardening | Alarms, smoke test, staging soak, promote to `main` | 2–3 |
| **Total** | | **15–23** |

At 5 to 7 sessions a week: about 2 to 5 weeks, most likely around 3.

## Order: A, B, C first (decided 2026-10-31)

A, B and C come first, about 5 to 8 sessions, roughly a week. This moves collection from the laptop to AWS, so history keeps building while the page is ported. History cannot be backfilled, which is why the collector goes first.

After that: G, then E (the big one), then H, I and J.

**Gate to decide:** E is the largest spend. The self-test ends Nov 21 ("I can name a moment where the window changed what I'd do"). Starting E before then risks polishing before the result is known. Waiting costs little, since history accumulates either way.

## Reuse from the existing app

- Sign-in, invite keys, admin screens, and the alarms and failure queues.
- Scheduled Lambdas through EventBridge (three exist in `amplify/backend.ts`).
- DynamoDB expiry through TTL, as the Session table does with `expiresAt`.
- The habit of one test file per handler and component (42 test files today).

## Risks

- `src/App.jsx` is an 891-line screen-switching state machine with no router. Adding a second app is riskier than it sounds (package A).
- The scrubber port (E) is the biggest and least certain piece. The prototype is about 650 lines of plain JavaScript, and tests and edge cases will roughly double it.
- Backend deploys take 13 to 15 minutes each, which stretches the calendar, not the effort.
- Stored feeds show what a person follows. The "How it works" copy has to say so (package I). The tarot keeps sessions for one day; the Window keeps news for 30.
- Storing feed titles and summaries for a few invited friends is low risk, but it is still republishing other people's text.

## Rough running cost

Probably a few dollars a month or less for a few friends. This is a guess, not calculated from AWS pricing. The existing $30 safety ceiling would catch a surprise. There is nothing to cap in this version, since paid search is not in it.

## Where the work happens

On the `observation-window` branch, in the worktree at `/Users/tonyreynolds/devtools/tarot-spa-observation`. The hourly laptop collector runs from there too. Backend changes only deploy once the branch is pushed and connected in Amplify, so pushing needs a decision from Tony first.
