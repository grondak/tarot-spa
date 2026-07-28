---
baseline_commit: 84f8a9faa13b263e248c90945ed0ed295e27006e
---

# Story 3.7: Draw for fun without spending your daily limit (authenticated Quick Draw)

Status: done

## Story

*(No PRD FR number — EXPERIENCE.md's IA names this as its own reachable surface, "alternate entry to Context Entry," but only its rate-limited-fallback form (Story 3.1) had a story; the deliberate, chosen-on-purpose path was never built as its own story.)*

As an authenticated user who still has Daily Orientation Limit remaining,
I want to draw cards without triggering an Orientation Guide,
So that I can play with the deck without spending a limited resource I might want to save.

**Scope reality check (read before starting Task 1):** Story 3.1's Dev Notes explicitly forward-delivered this story's feature as a "Quick Draw bridge," because shipping Context Entry as the authenticated home without it would have regressed the app's existing free-draw capability for real users. The bridge (`Draw for fun instead` / `Back to Help Me Orient`, `mode` state in `ContextEntry.jsx`) and the rate-limited default-landing behavior are **already implemented and already have unit + e2e coverage** (`src/components/ContextEntry.jsx`, `src/components/ContextEntry.test.jsx`, `e2e/authenticated.spec.js`). This story does **not** start from zero. Its job — per Story 3.1's own note, "Story 3.7 shrinks to verifying/formalizing this navigation plus its rate-limited-default AC" — is to: close one genuine test-coverage gap (Task 1), formalize two open decisions Story 3.1 explicitly deferred (Task 2), then run the full verification/close-out cycle (Tasks 3–4). Expect a small diff. Do not rebuild the toggle, rewrite `ContextEntry.jsx`'s structure, or add new components/screens.

## Acceptance Criteria

1. **Given** an authenticated user is on their authenticated home, **when** they choose Quick Draw instead of "Help Me Orient," **then** they reach the same free, unlimited Quick Draw experience as the public version — no LLM call, no Daily Orientation Limit unit consumed
2. **Given** an authenticated user is in Quick Draw, **when** they want to return to the Orientation flow, **then** they can navigate back to Context Entry directly
3. **Given** an authenticated user has already exhausted their Daily Orientation Limit, **when** they reach their authenticated home, **then** they land in this same Quick Draw experience by default (Story 3.1's Rate-Limited Intake) rather than a separate screen — it's one consistent experience whether chosen deliberately or arrived at via the limit

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. Same dedicated agent test account as every authenticated story since 3.1 (`TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD` in the shell). No new setup — this story adds no new backend, no new secret, no new IAM surface.
2. Sandbox/`amplify_outputs.json` reachable locally if it was torn down, same as any story running `npm run dev` or Playwright's authenticated project.

## Scope decisions (made at story creation — implement as written, flag disagreement rather than silently deviating)

1. **The SpreadView round-trip mode-reset is accepted behavior, not a bug to fix.** If a user in deliberate Quick Draw mode draws a spread (`ContextEntry` unmounts, `SpreadView` mounts) and then clicks `SpreadView`'s own `← Back`, `ContextEntry` remounts fresh in canonical `orient` mode rather than back in `quickdraw` mode — because `mode` is local `useState` inside `ContextEntry`, and the component unmounts while `SpreadView` is showing. **Tony decided (2026-07-25, at story creation): document this, do not fix it.** AC 2 ("navigate back to Context Entry directly") is fully satisfied by the direct `Back to Help Me Orient` button, which never unmounts `ContextEntry` and preserves Context/Spread state exactly (already implemented, already tested). No spec source (epics.md, EXPERIENCE.md's IA table) requires the toggle position itself to survive a draw-then-back round trip through `SpreadView`. Do **not** lift `mode` into `App.jsx`, add a prop to force initial mode, or otherwise add state to make this sticky — that is exactly the kind of premature complexity this solo-owned project avoids absent a real requirement. Record this decision in `deferred-work.md` at close-out (Task 2).
2. **The bridge copy is hereby formally approved, not merely "flagged."** Story 3.1 authored `Draw for fun instead` / `Back to Help Me Orient` with no spec source and flagged both strings "for Tony's review" in its completion notes. Six stories have shipped since (3.2, 3.3, 3.4, 3.5, 3.6, 3.8) with no objection or change request. Treat both strings as final, Tony-approved copy as of this story — same status as the `tarotSpaOrientationRedrawContext` key's "Tony-approved 2026-07-24" precedent in `project-context.md`. Do not alter the copy; if Tony wants a change, that is out of scope for this story.
3. **No new live-verification path is invented for AC 3.** Reaching a genuinely rate-limit-exhausted account live would require spending real Bedrock/Tavily money against the Daily Orientation Limit purely to take a screenshot — an unjustified real-money cost for a state that is already fully covered by deterministic Vitest render tests (`rateLimited` is a controlled prop; Story 3.2/3.8 already prove server-side enforcement elsewhere). Per Story 3.1's identical precedent, Vitest is the accepted evidence for AC 3; do not attempt to manufacture real exhaustion.

## Explicitly out of scope (do not build)

- Any fix for the Scope decision 1 quirk (accepted as-is).
- Any change to the bridge copy (Scope decision 2 — approved as-is).
- Any new component, screen, or route. `ContextEntry.jsx` already contains 100% of this story's UI surface.
- Any `amplify/**` change. Quick Draw (all variants) is and remains purely client-side `shuffleAndDraw`/`encodeDraw`/`decodeDraw` (AD-12) — it was true before this story and nothing here changes it.
- Attempting to reach genuine rate-limit exhaustion in live/e2e verification (Scope decision 3).

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight** (AC: none — gate)
  - [x] Confirm `git log -1` is `84f8a9f` and the tree is clean before any change. If pre-existing uncommitted work exists, isolate and commit it separately first (standing 3.4/3.5/3.6 precedent) — never discard it.
  - [x] Baseline gates green: `npm test` (270/270 expected — confirm the real number, don't assume), `npm run lint`, `npm run typecheck`, `npm run build`.
  - [x] Confirm the test account still works: `npm run dev`, log in via the UI, confirm `Help Me Orient` renders as the authenticated home.
- [x] **Task 1: Close the AC 1 test-coverage gap** (AC: 1)
  - [x] `src/components/ContextEntry.test.jsx`, `describe('ContextEntry deliberate quick draw')` block: add one test alongside the existing "switches to Quick Draw... and returns with Context intact" test. New test: after clicking `Draw for fun instead`, click a spread button (e.g. `spreadButton('single')`) and assert `onQuickDrawSelect` was called exactly once with the key, and `onOrient` was never called. This is the one real gap — the existing rate-limited-state test already proves this wiring for the *rate-limited* entry point (`'draws through onQuickDrawSelect when a spread is clicked'`), but no test yet proves it for the *deliberate* entry point, which is this story's actual subject (AC 1's "no LLM call" guarantee, exercised via the path this story is named for).
  - [x] Do not duplicate or restructure any other existing test in this file — the rest of AC 1/2/3 already has direct coverage (see References).
- [x] **Task 2: Formalize the two open decisions** (AC: none — documentation, binds future stories)
  - [x] Add an entry to `_bmad-output/implementation-artifacts/deferred-work.md` under a new `## Recorded for Story 3.7 (2026-07-25)` heading recording Scope decision 1 (SpreadView round-trip mode reset, accepted-as-is, Tony 2026-07-25) verbatim enough that a future story can find it without re-deriving the mechanism.
  - [x] No code change for Scope decision 2 (copy approval) — it is a status change in this story record only, not a diff.
- [x] **Task 3: Full regression + verification** (AC: 1, 2, 3)
  - [x] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` — all green with the new test included.
  - [x] `npm run test:e2e` with `TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD` set: confirm `e2e/authenticated.spec.js`'s existing "authenticated home is Context Entry with a working quick-draw bridge" test still passes unmodified — it already exercises AC 1 (bridge reaches a real card draw with no LLM path) and AC 2 (`← Back` returns to `Help Me Orient`). No new e2e test is required; this existing spec already covers this story's live-reachable ACs. Also run with `TAROT_E2E_EMAIL` unset to confirm the public-only path stays green.
  - [x] Live spot-check (`npm run dev`, logged in): reach Quick Draw via `Draw for fun instead`, draw a card, confirm no network/LLM activity accompanies the draw (Network tab — only the existing account-load/GraphQL calls, nothing draw-related), then `Back to Help Me Orient` returns with Context intact (AC 1, 2). AC 3 (rate-limited default) has no new live check — its accepted evidence is the existing Vitest suite (Scope decision 3).
- [x] **Task 4: Close out (Definition of Done)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
  - [x] Sweep the diff and this story file for credentials — this story touches no secrets, but the standing sweep still applies.
  - [x] Update `sprint-status.yaml` (3-7 → review).
  - [x] Commit the small diff (expected: `ContextEntry.test.jsx`, `deferred-work.md`, `sprint-status.yaml`, this story file) and push to `main`.

### Review Findings

- [x] [Review][Patch] `deferred-work.md`'s Story 3.7 entry understates the SpreadView round-trip quirk — it only mentions `mode` resetting, but tracing `ContextEntry.jsx`/`App.jsx` shows the typed Context text and selected Spread are also silently discarded on that same round trip, since `App.handleBack` never syncs `orientContext`/`orientSpreadKey` from what the user entered before switching to Quick Draw. The entry's own stated purpose is to let a future story find the mechanism "without re-deriving" it, so the inaccuracy defeats that purpose. [_bmad-output/implementation-artifacts/deferred-work.md:43]
- [x] [Review][Patch] Scope decision 2's "Four stories have shipped since (3.2, 3.4, 3.5, 3.6)" undercounts — `sprint-status.yaml` shows 3-3 and 3-8 are also `done` and shipped between 3.1 and 3.7, and both touch `ContextEntry.jsx`. The correct list is six stories (3.2, 3.3, 3.4, 3.5, 3.6, 3.8). [_bmad-output/implementation-artifacts/3-7-draw-for-fun-without-spending-your-daily-limit-authenticated-quick-draw.md:33]
- [x] [Review][Defer] No test covers deliberate Quick Draw entered via the "Load Draw" code field (`onLoadCode`) rather than a spread-button click — AC 1's "no LLM call" guarantee is only exercised for the spread-button path. Pre-existing gap; Task 1 explicitly scoped the new test to the spread-button path only. [src/components/ContextEntry.test.jsx] — deferred, pre-existing
- [x] [Review][Defer] Partial e2e credentials (only one of `TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD` set) are not guarded against — the authenticated Playwright project could attempt a login with a missing credential and fail ambiguously. Pre-existing e2e harness behavior, unrelated to this diff's files. [e2e credential setup] — deferred, pre-existing
- [x] [Review][Defer] `npm test` showed one flaky failure (`act()`/cleanup-related) before passing clean on a rerun during adversarial review; a follow-up rerun during triage was clean (271/271). Unconfirmed/non-reproducible, likely pre-existing suite flakiness unrelated to this diff. [test suite infra] — deferred, pre-existing

## Dev Notes

### What already exists — reuse, do not rebuild any of this

- **`src/components/ContextEntry.jsx`** — the entire feature. `mode` state (`'orient' | 'quickdraw'`), the `rateLimited || mode === 'quickdraw'` combined render branch (AC 3's "one consistent experience" is this single `if` — both paths render the identical JSX block, differing only by the rate-limit note), `Draw for fun instead` (`onClick={() => setMode('quickdraw')}`), `Back to Help Me Orient` (`onClick={() => setMode('orient')}`, rendered only `!rateLimited`).
- **`src/components/ContextEntry.test.jsx`** — `describe('ContextEntry rate-limited state')` and `describe('ContextEntry deliberate quick draw')` blocks already assert most of AC 1–3. Task 1 adds exactly one test to close the one gap identified above.
- **`e2e/authenticated.spec.js`** — `'authenticated home is Context Entry with a working quick-draw bridge'` already drives the exact live round trip this story cares about (fill Context → pick Spread → `Draw for fun instead` → draw a card → `← Back`). Do not write a second, near-duplicate e2e test.
- **`src/App.jsx`** — `handleSelect`/`handleDrawAgain`/`handleBack`/`handleLoadCode`, the `spreadKey ? SpreadView : ContextEntry` branch. This is the entire drawing engine `onQuickDrawSelect`/`onLoadCode` plug into; nothing here needs to change.
- **`src/components/SpreadSelector.jsx`**, **`src/components/SpreadView.jsx`** — reused verbatim, no changes.

### Architecture compliance checklist (the ADs/NFRs that bind this story)

- **AD-12**: Quick Draw stays entirely client-side (`shuffleAndDraw`/`encodeDraw`/`decodeDraw` from `src/utils/deck.js`) — verified by inspection that `ContextEntry`'s quick-draw branch only ever calls `onQuickDrawSelect`/`onLoadCode` (App's existing client-only handlers), never `onOrient` or anything from `src/utils/orientation.js`. This story adds no new call path, so this guarantee is structural, not something to newly test at the network layer.
- **NFR4**: no client-side limit logic exists or is added here; `rateLimited` remains a prop computed elsewhere (Story 3.2/3.8), never derived client-side.
- **UX-DR12**: "zero LLM/DB-write involvement, free and unlimited" — already true, reconfirmed by Task 1's new assertion and Task 3's live network check.
- **No new Amplify Data model, no `amplify/**` change** — nothing in this story touches AD-8's fixed model set.

### Previous story intelligence (3.1, 3.6)

- **3.1 is the direct originating context for this entire story** — read its "Scope decision: the Quick Draw bridge" Dev Notes section (`_bmad-output/implementation-artifacts/3-1-enter-context-and-pick-a-spread.md`) for the full reasoning behind why the bridge was forward-delivered and exactly what it deferred to this story (the navigation-loop "formalization" and the two copy strings' review flag). Both of those deferred items are resolved by this story's Scope decisions 1 and 2.
- **3.6's process discipline applies unchanged**: Task 0 baseline verification before touching anything; isolate any pre-existing dirty-tree work rather than discarding it; outcome-phrased verification (Task 3 names "no network/LLM activity accompanies the draw," not "the function returned successfully"); exact-value test assertions over loose partial matches (Task 1's new test should assert the exact call count and argument, mirroring the existing rate-limited-path test's style).
- **No Tavily/worker-redeploy risk here** — this story never touches `orientation-guide`, `orientation-alert`, or any Lambda; no alias-qualified probe needed.

### Git intelligence

Recent history (`84f8a9f` back through `4fcd79c`) is Story 3.6's implementation and its two-round code review, all `amplify/**`-only with zero `src/` changes. This story inverts that shape: `src/` test-only change plus documentation, zero `amplify/**` changes. Commit-message prefixes in use: `feat:`, `fix:`, `test:`, `docs:`, `chore:`. Given this story's diff is one test addition plus two documentation-only formalizations, a single `test:` or `docs:`-prefixed commit is appropriate — use judgment on which prefix best fits the actual diff at commit time.

### Project Structure Notes

- Updated: `src/components/ContextEntry.test.jsx` (+1 test), `_bmad-output/implementation-artifacts/deferred-work.md` (+1 entry), `_bmad-output/implementation-artifacts/sprint-status.yaml`, this story file.
- NOT touched: `src/components/ContextEntry.jsx`, `src/App.jsx`, `src/AppAuth.test.jsx`, `src/components/SpreadSelector.jsx`, `src/components/SpreadView.jsx`, `e2e/authenticated.spec.js`, `e2e/public-landing.spec.js`, everything under `amplify/**`, `scripts/**`, `package.json`, `vite.config.js`, `epics.md`. If the diff grows beyond the four files above, something went off-spec — stop and reconcile against this story before continuing.

### References

- [Source: epics.md#Story-3.7] — the 3 ACs verbatim, and the epic-level note this story quotes about the IA/rate-limited-only prior coverage; [#Epic-3] Correct-course priority note (does not gate this story — that gate was satisfied before Story 3.4)
- [Source: _bmad-output/implementation-artifacts/3-1-enter-context-and-pick-a-spread.md] — "Scope decision: the Quick Draw bridge," "Known acceptable quirk (document, don't fix)," and the copy-review-flag notes this story formally resolves; also the exact `ContextEntry` prop contract this story must not rename
- [Source: src/components/ContextEntry.jsx] — the complete existing implementation this story verifies rather than rebuilds
- [Source: src/components/ContextEntry.test.jsx] — existing coverage; Task 1 adds one test in the `'ContextEntry deliberate quick draw'` describe block
- [Source: e2e/authenticated.spec.js] — existing live-reachable coverage for AC 1/2, unmodified by this story
- [Source: EXPERIENCE.md#Information-Architecture] — "Quick Draw (authenticated) | Authenticated home, alternate entry to Context Entry ... already exists in the live app" — confirms no spec requires round-trip mode persistence (Scope decision 1)
- [Source: project-context.md] — the `tarotSpaOrientationRedrawContext` "Tony-approved 2026-07-24" precedent this story's Scope decision 2 copy-approval follows the same shape as
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — existing entry format Task 2's new entry follows
- [Source: src/utils/deck.js, src/utils/orientation.js] — confirms the exact function boundary between client-only Quick Draw and network-calling Orientation Guide code (AD-12 compliance check)

## Dev Agent Record

### Agent Model Used

OpenAI Codex (GPT-5)

### Implementation Plan

- Preserve the existing Quick Draw implementation and close only the deliberate-entry callback coverage gap with one focused component test.
- Record the accepted SpreadView round-trip reset in deferred work, then verify all unit, static, build, authenticated, unauthenticated, and live-reachable flows before close-out.

### Debug Log References

- 2026-07-25: Pre-flight found the Story 3.7 draft and its `ready-for-dev` sprint entry uncommitted on baseline `84f8a9f`; isolated them in commit `15ae686` before implementation.
- 2026-07-25: In-app browser connection was unavailable before page load due missing sandbox metadata; used the repository's authenticated Playwright setup and spec as the credential-safe UI fallback.
- 2026-07-25: Task 1's test was green on addition because Story 3.1 had already forward-delivered the callback behavior; no artificial production regression was introduced solely to manufacture a red phase.
- 2026-07-25: Live network spot-check initially classified all POSTs as draw-related; refined the assertion to the story's actual forbidden signals. Observed only delayed Cognito/AppSync account-loading calls and zero generation/provider requests.

### Completion Notes List

- Task 0 complete: confirmed baseline `84f8a9f`, isolated pre-existing story-authoring work, passed 270/270 baseline tests plus lint/typecheck/build, and passed the authenticated account setup and Context Entry Quick Draw bridge spec.
- Task 1 complete: added the sole deliberate Quick Draw callback test; focused ContextEntry coverage passed 21/21 and the full suite passed 271/271 with lint, typecheck, and build green.
- Task 2 complete: recorded the accepted-as-is SpreadView round-trip mode reset and preserved the approved bridge copy without code changes; full regression remained 271/271.
- Task 3 complete: passed 271/271 unit tests, lint, typecheck, build, 4/4 authenticated E2E cases, and 2/2 public-only E2E cases. Live verification rendered a card with no Orientation Guide/provider request, preserved Context through the direct Quick Draw return, and returned from SpreadView to Context Entry.
- Task 4 complete: exact four-file diff passed whitespace and credential sweeps; all tasks, ACs, and Definition of Done gates are satisfied and the story is ready for review.

### File List

- _bmad-output/implementation-artifacts/3-7-draw-for-fun-without-spending-your-daily-limit-authenticated-quick-draw.md
- _bmad-output/implementation-artifacts/deferred-work.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/components/ContextEntry.test.jsx
## Change Log

- 2026-07-25: Story created via create-story workflow. Discovered during research that Story 3.1 had already forward-delivered this story's entire feature surface (the Quick Draw bridge) with existing unit + e2e coverage; scope reduced accordingly to one test-coverage gap plus formalizing two decisions Story 3.1 explicitly deferred. Tony confirmed (2026-07-25) the SpreadView round-trip mode-reset quirk should be documented as accepted, not fixed. Status: ready-for-dev.
- 2026-07-25: Review pass (checklist-driven) — re-verified every factual claim against the live repo rather than trusting the first pass: `git log 4fcd79c..84f8a9f` confirmed the git-intelligence claim (Story 3.6 was `amplify/**`-only, zero `src/`), `npm test` reconfirmed 270/270, and the 3.1 story-file quotes were checked verbatim. Fixed one clerical error (Scope decision 2 miscounted the shipped-stories list as "Three" when four were named: 3.2, 3.4, 3.5, 3.6). No other defects found — task instructions, file-scope guardrails, and AC-to-evidence mapping all checked out. Status remains ready-for-dev.
- 2026-07-25: Implemented Story 3.7 by adding the deliberate Quick Draw callback guard test, recording the accepted SpreadView round-trip reset, and completing unit/static/build/E2E/live verification. Status: review.
- 2026-07-25: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 2 patch findings applied (deferred-work.md round-trip entry corrected to include Context/Spread loss, not just `mode`; Scope decision 2's story count corrected from four to six). 3 pre-existing gaps deferred to `deferred-work.md`. 10 findings dismissed as noise or already-decided scope. Status: done.
