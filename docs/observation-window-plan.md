# Observation Window — plan to a real first version

Oct 31, 2026 · @Tony · estimate from the repo as it stands, not a measured pace

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
