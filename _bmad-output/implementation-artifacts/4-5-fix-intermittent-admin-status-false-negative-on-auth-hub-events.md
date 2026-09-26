---
created: 2026-09-23
updated: 2026-09-25
origin: discovered during Story 4.3 live verification, not from epics.md
baseline_commit: 0d9b324
---

# Story 4.5: Fix intermittent Admin-status false-negative on Amplify auth Hub events

Status: review

## Story

As Tony,
I want the Admin Dashboard to stay open and reliably show the outcome of an action I take on it,
So that an authenticated Cognito token refresh happening mid-action doesn't silently kick me out or swallow the result.

**Not from `epics.md`.** This is a bug discovered live during Story 4.3's Task 8 verification, reproduced once, and — as of story creation — still not root-caused with certainty. It reinforces, with a much more specific trigger, the long-open Epic 2/Epic 3 retro action item "Classify the 'Account couldn't load' transient" (see References). **Fourth story of Epic 4**, but not epics.md-numbered; Stories 4.1–4.3 already provide the `Admin` Cognito group, the hidden/non-admin navigation gate, `AdminDashboard.jsx`, and the pattern this story must not regress.

## Acceptance Criteria

*(Carried over verbatim from the draft filed 2026-09-23 at Story 4.3 close-out. Refine only if this story's own root-cause investigation proves a specific clause wrong — do not silently redefine "unknown" or the demotion contract without flagging it.)*

1. **Given** an authenticated Account who is genuinely in the `Admin` group, **when** any Amplify auth Hub event fires during their session (including a routine token refresh triggered by an authenticated mutation), **then** the Admin Dashboard does not close and no in-flight action's result is lost.
2. **Given** the admin-status recheck cannot get a definitive answer (transient/mid-refresh error), **when** deciding whether to close the dashboard, **then** the app treats "unknown" differently from "confirmed not Admin" and does not demote/exit on "unknown."
3. **Given** an Account is genuinely removed from the `Admin` group, **when** the next legitimate recheck runs, **then** the dashboard still closes — this story must not regress Story 4.1's original requirement (and must not regress the existing `AppAuth.test.jsx` test "refreshes Admin navigation when token group membership changes", which proves exactly this).
4. **Given** any authenticated mutation issued from the Admin Dashboard (Save cost controls, Mint Key, and future writes), **when** a token refresh happens concurrently, **then** the mutation's own success/failure status still renders to the user.

### Acceptance clarifications required by this story's own investigation

5. **Root cause is not pre-frozen.** Unlike a normal feature story, this story's first task is confirming or refuting the hypothesis below with a deterministic repro (a test that fails against the current code and passes after the fix) — not implementing a guessed fix against an assumed cause. If the confirmed cause differs materially from the hypothesis, update this file's Dev Notes with what was actually found before writing the fix, per this project's "flag disagreement instead of silently deviating" convention (see Story 4.3 Dev Notes §1).
6. **AC4 is a design decision, not just a bug fix, if the confirmed cause is a real (not false-negative) demotion racing an in-flight save.** The straightforward fix for AC1–AC3 (distinguish "unknown" from "confirmed false" in `isAdmin()`, don't demote on "unknown") fully resolves the *observed* symptom, because the observed case was a false negative, not a real demotion. But AC4's literal text also covers the rarer case of a **real** demotion landing mid-save. Making that case "still render the mutation's status" requires `AdminDashboard`/`App.jsx` coordination beyond `isAdmin()` alone (e.g., not unmounting `AdminDashboard` while a child mutation is in flight). Implement the AC1–AC3 fix unconditionally; if closing that gap for the rare real-demotion race requires nontrivial App-level plumbing, propose the approach to Tony before building it rather than guessing at the UX (does the dashboard finish showing the result and then close? Show a toast after closing? Not close until a manual Back?).
7. **This story's fix must not touch `AccountBar`'s separate `getMyAccount()` failure path** (`src/App.jsx`'s `AccountBar` component, "Account couldn't load"/`role="alert"`). That is a different function against a different backend (AppSync `Account.list()`, not Cognito `fetchAuthSession()`) and remains the *original*, still-unclassified transient from the Epic 2 retro (2026-07-17) — same suspected *class* of problem (an Amplify auth call executing during token rotation), but a distinct code path with its own retry-button mitigation already in place. If this story's investigation surfaces a shared root cause, say so in Dev Notes/Completion Notes and recommend a follow-up story — do not fold a fix for it in here unasked.

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. No new secret, provider account, model access, or third-party setup is required.
2. Use the repository's established Node 24.9.0 runtime (per Story 4.1–4.3's recorded caveat: Node 25 produced unrelated jsdom `localStorage` failures).
3. A deterministic repro (Task 1 below) is designed to run entirely under Vitest by mocking `fetchAuthSession`/`Hub.listen`, the same pattern `src/AppAuth.test.jsx` and `src/utils/adminAuth.test.js` already use — it does **not** require live AWS/Cognito access. Live sandbox access (Tony's `Admin` session) is only needed if the dev agent additionally wants to attempt a live reproduction; treat that as optional, opportunistic verification, not a blocking gate, since the original bug was already observed live once (Story 4.3's Dev Agent Record) and a second live sighting is not guaranteed on demand.
4. If deterministic reproduction genuinely cannot be achieved through mocks (unexpected), stop and report back rather than shipping a guessed fix with no failing-test proof — this project's testing convention requires every new test to be shown failing against a wrong implementation before it counts as coverage.

## Observed symptom (2026-09-23, live sandbox)

1. Tony, signed in as the sole `Admin` group member (`grondak@gmail.com`), opened the Admin Dashboard, edited the daily limit to `7` in `AdminConfigEditor`, and clicked "Save cost controls."
2. The button switched to "Saving…", then the whole Admin Dashboard disappeared and the app returned to the main authenticated view. No success status (`role="status"`, "Cost controls saved.") and no error (`role="alert"`) ever rendered.
3. Re-opening the Admin Dashboard confirmed the save had actually succeeded server-side: `dailyLimit` was `7`. The underlying `Config.update` mutation, its authorization, and its validation are not implicated — see Story 4.3's Dev Agent Record, where the same mechanism was independently proven correct via direct AppSync-console mutations (wrong-id rejected with `ConditionalCheckFailedException`; out-of-range rejected with the exact frozen validation message).
4. Immediately after, clicking "Mint Key" on the same dashboard (Story 4.2's action, also an authenticated Data mutation) completed normally with no kick-out.

## Working root-cause hypothesis (unconfirmed — Task 1 is to verify or refute this)

`src/App.jsx:162-200` has a `Hub.listen('auth', refreshAuth)` effect (added for Story 1.3/1.4) that calls `getCurrentUser()` on **every** Amplify auth Hub event, with no filter on `payload.event`, and on success bumps `authRefreshRevision` (line 170). `authRefreshRevision` is a dependency of a second effect (`src/App.jsx:231-249`, added in Story 4.1's review) that re-runs `isAdmin()` (`src/utils/adminAuth.js`) and calls `setShowAdminDashboard(false)` (line 242) whenever it comes back `false`. `AdminDashboard` is conditionally rendered (`src/App.jsx:673-674`), so `setShowAdminDashboard(false)` unmounts it outright — which is why the in-flight `AdminConfigEditor` save's success status never had a chance to render (`AdminConfigEditor.jsx`'s own `mounted.current` guard, added in Story 4.3, correctly suppresses the resulting stale-state warning, but that guard is exactly what silently swallows the result).

`isAdmin()` (`src/utils/adminAuth.js:3-11`) calls `fetchAuthSession()` and reads `session.tokens?.idToken?.payload?.['cognito:groups']`; **any** thrown error is caught and mapped to `false` (line 8-9) — there is no distinction between "confirmed not in the Admin group" and "transient failure to read the session mid-refresh."

**Confirmed supporting mechanism (installed `aws-amplify@6.18.0`, verified 2026-09-25 by reading `node_modules/@aws-amplify/auth/src/providers/cognito/tokenProvider/TokenOrchestrator.ts`):**
- `TokenOrchestrator.getTokens()` only deduplicates *OAuth in-flight* redirects (`waitForInflightOAuth()`); it has **no mutex or de-duplication around a plain token refresh**. If the ID/access token is expired and two callers invoke `fetchAuthSession()` at nearly the same moment (e.g., `isAdmin()`'s own recheck racing whatever Amplify Data's AppSync client does internally to authorize the `Config.update`/`mintInviteKey` mutation), both can independently call `refreshTokens()` → the real Cognito `InitiateAuth`/`RESPOND_TO_AUTH_CHALLENGE` refresh call.
- Each *independent, successful* refresh call dispatches its own `Hub.dispatch('auth', { event: 'tokenRefresh' })` (`TokenOrchestrator.ts` `refreshTokens()`), and a failed one dispatches `tokenRefresh_failure` with the underlying `AuthError` — both go through the exact same `'auth'` Hub channel `App.jsx` already listens on with no filtering.
- Cognito's refresh-token rotation can make the *loser* of two near-simultaneous refresh calls fail (Amplify's own error taxonomy specifically names `RefreshTokenReuseException` as an auth-invalidating error in `TokenOrchestrator.ts`'s `isAuthenticationError()`), which is a plausible concrete mechanism for `fetchAuthSession()` to transiently throw inside `isAdmin()` for a real, still-valid admin, purely from timing — not from anything wrong with the session itself.
- This makes the hypothesis substantially more concrete than "maybe a race": it identifies the specific unsynchronized code path (`TokenOrchestrator.getTokens()`) and the specific Hub event names (`AuthHubEventData` in `@aws-amplify/core`: `signedIn`, `signedOut`, `tokenRefresh`, `tokenRefresh_failure`, `signInWithRedirect`, `signInWithRedirect_failure`, `customOAuthState`) available to filter on if that turns out to be part of the fix.
- This would explain why Mint Key — issued once the token was already fresh from the earlier refresh — didn't retrigger the race, while Config's Save did, purely by timing rather than anything specific to Config.update.

## Suggested investigation entry points

- `src/App.jsx:162-200` (`Hub.listen('auth', refreshAuth)` effect) and `src/App.jsx:231-249` (the `isAdmin()`-recheck effect, dependency `authRefreshRevision`).
- `src/utils/adminAuth.js:3-11` (`isAdmin()`'s blanket `catch { return false }`).
- Reproduce deterministically in Vitest: mock `fetchAuthSession` to reject once (simulating a losing concurrent refresh) while a mounted `AdminDashboard`/`AdminConfigEditor` save is in flight, and assert the dashboard does *not* close and the save's own status still renders. This does not require a live token-rotation race — mocking the transient rejection is sufficient and is this project's established testing convention (see Story 4.3 Dev Notes "Testing requirements": every new test must be shown failing against a wrong boundary first).
- Confirm whether `payload.event` filtering (only re-running `isAdmin()` on `signedIn`/`signedOut`, not on every `tokenRefresh`) is sufficient on its own, or whether `isAdmin()` also needs its own unknown/false distinction regardless — the two are complementary, not either/or: event filtering reduces *how often* the recheck runs; the unknown/false distinction fixes what happens *when a transient failure occurs anyway* (which can still happen on a legitimate `signedIn`/`signedOut` recheck, e.g. immediately after actual sign-in before the ID token is fully settled).

## Explicitly out of scope (do not build)

- Any change to `AccountBar`'s `getMyAccount()`/"Account couldn't load" path (clarification 7 above) unless the investigation proves a shared root cause — then flag it, don't fix it inline.
- Any change to `amplify/data/resource.ts`, Config authorization/validation, `AdminConfigEditor.jsx`'s save/validation logic, or `MintInviteKey.jsx` — all independently proven correct in Stories 4.2/4.3. This story's fix lives in the admin-status recheck path (`App.jsx`, `adminAuth.js`), not in what the dashboard's buttons do.
- Weakening Story 4.1's requirement that a real, confirmed Admin-group removal still closes the dashboard (AC3) — do not "fix" the false negative by simply never closing the dashboard.
- A general-purpose retry/backoff wrapper around `fetchAuthSession()` for every caller in the app; scope the fix to the admin-status recheck path this story owns.
- Introducing a new global auth-state library/Context to solve this — `App.jsx` remains the single owner of auth-derived state per this project's architecture (AD-1/Project Context "React and Client State": no Context or external state library without an explicit architecture decision).

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight** (gate)
  - [x] Confirm `git log -1 --oneline` starts at `0d9b324` (or document a later reviewed baseline) and preserve any unrelated dirty-worktree changes.
  - [x] Use Node 24.9.0. Run baseline `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; record actual counts (362/362 tests as of Story 4.3's close-out — verify current, don't assume it hasn't moved).

- [x] **Task 1: Reproduce the false negative deterministically** (AC: 5; must complete before Task 2)
  - [x] Write a Vitest test (in `src/utils/adminAuth.test.js` and/or `src/AppAuth.test.jsx`) that simulates a transient `fetchAuthSession()` rejection for a session that *is* genuinely in the `Admin` group, and shows the **current** code's failure mode: `isAdmin()` resolves `false`, and (in the `AppAuth.test.jsx` integration case) `AdminDashboard` unmounts / `showAdminDashboard` becomes `false`.
  - [x] Confirm this test fails against the current, unmodified code (proving it exercises the real bug) before writing any fix. Record the confirmation in the Dev Agent Record.
  - [x] If this simulated transient does not reproduce the observed symptom, stop and re-open the root-cause investigation (see "Suggested investigation entry points") rather than proceeding on an unconfirmed cause.

- [x] **Task 2: Give `isAdmin()` a third outcome for "can't tell"** (AC: 2, 3; clarification 5)
  - [x] Change `src/utils/adminAuth.js` so a thrown/failed session read is distinguishable from a confirmed "not in the Admin group" — e.g., return `null`/`undefined` (or a small typed result) for "unknown" versus `true`/`false` for a definite answer, however this project's existing boolean-returning caller conventions are best preserved. Keep the function name/shape change minimal; this is a contract change other code depends on (see Task 3).
  - [x] Update `src/utils/adminAuth.test.js`: the existing test "fails closed when fetching the session throws" (line 35-38) currently asserts `resolves.toBe(false)` — this is the exact behavior being changed. Update its expectation to the new "unknown" contract, and add tests proving the array/tokens/groups-mismatch cases still resolve definitively to `false` (those are confirmed answers, not transient failures — do not weaken them).

- [x] **Task 3: Make the App.jsx recheck effect not demote on "unknown"** (AC: 1, 2, 3)
  - [x] `src/App.jsx:231-249`: only call `setShowAdminDashboard(false)` when `isAdmin()` resolves to a confirmed `false`, never on "unknown." Decide (and record the reasoning) whether `isAdminUser` itself should also stay unchanged on "unknown" rather than flipping, since flipping the Account Bar's own "Admin Dashboard" button visibility on a transient would be a milder version of the same bug.
  - [x] Evaluate the `payload.event`-filtering option from "Suggested investigation entry points" as a complementary reduction of *how often* the recheck fires — implement it only if it doesn't complicate the fix disproportionately; the unknown/false distinction in Task 2 is the required fix regardless of whether this filtering is added.
  - [x] Do not change `refreshAuth()`'s own authenticated/unauthenticated logic (lines 163-196) — that is Story 1.3/1.4's territory and already has its own passing regression coverage in `AppAuth.test.jsx`.

- [x] **Task 4: Resolve or explicitly defer the AC4 in-flight-mutation edge case** (AC: 4; clarification 6)
  - [x] Confirm whether Tasks 2-3 alone already satisfy AC4 for the observed (false-negative) case — they should, since the dashboard simply never unmounts when the admin recheck correctly returns "unknown" instead of demoting. Confirmed by the "still renders a Save Cost Controls result after a transient session-read failure mid-save" test (`src/AppAuth.test.jsx`), proven mutation-survivable by temporarily reverting `App.jsx`/`adminAuth.js` and observing it fail.
  - [x] For the separate, rarer "genuinely demoted mid-save" case: closing that gap requires nontrivial coordination between `AdminDashboard`'s in-flight mutation state and `App.jsx`'s demotion effect — see Dev Agent Record for the design options written up for Tony's direction; not implemented in this story per clarification 6.

- [x] **Task 5: Regression coverage** (AC: 1, 2, 3, 4)
  - [x] `src/AppAuth.test.jsx`: the existing test "refreshes Admin navigation when token group membership changes" (line 285-312) is the load-bearing proof that a *real* demotion still closes the dashboard — it must keep passing unmodified in behavior (its mock only ever returns definite `[]` or `['Admin']`, never a thrown error, so it should be unaffected by the unknown/false split; verify this explicitly rather than assuming it). Confirmed passing unmodified.
  - [x] Add a new integration test alongside it: a transient `fetchAuthSession` failure while `AdminDashboard` is open and/or while `AdminConfigEditor`'s save is in flight does not close the dashboard and (for the save case) the save's own success or error status still renders. Added both: "does not close the Admin Dashboard on a transient session-read failure for a genuine admin" and "still renders a Save Cost Controls result after a transient session-read failure mid-save".
  - [x] Every new test must be shown failing against the pre-fix code per this project's mutation-survivable testing convention (already demonstrated in Task 1 for the core repro — extend that same discipline to these). Verified both new tests fail against a temporary revert of `App.jsx`/`adminAuth.js`.

- [x] **Task 6: Close out (Definition of Done)**
  - [x] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` with existing specs.
  - [x] Opportunistic live check (optional, not blocking): skipped — not attempted this session; the deterministic Vitest coverage (Tasks 1, 5) is this story's required and sufficient evidence per its own Definition of Done.
  - [x] Review changed-file inventory; sweep code, tests, logs, and this story for credentials or personal Context/Guide content.
  - [x] Update sprint status to `review` only when implementation and verification are complete.
  - [x] Commit and push. Paste actual empty `git status --short` output and `git log -1 --oneline --decorate` in the Dev Agent Record; prose-only "committed and pushed" is insufficient (per the epic-3 retro action item this project already adopted).

## Dev Notes

### Scope decisions (made at story creation — flag disagreement instead of silently deviating)

1. **This is an investigation-first story, not a frozen-contract story.** Unlike Story 4.3, the exact fix shape depends on Task 1's confirmed reproduction. The tasks above sequence "prove the bug deterministically" before "fix it" deliberately — do not skip Task 1 and jump to implementing the hypothesis untested.
2. **`isAdmin()`'s return contract is changing** from boolean-always to a tri-state (confirmed-true / confirmed-false / unknown). This is a deliberate, disclosed breaking change to an existing utility with existing test coverage (`adminAuth.test.js`) — update that coverage as part of this story, don't leave it asserting the old boolean-only contract.
3. **AC4's rare real-demotion-mid-save edge case is explicitly allowed to end in a "propose to Tony" outcome, not a fully autonomous implementation**, because it is a UX decision (what happens visually when you're legitimately kicked out mid-action), not a pure bug fix. See clarification 6.
4. **The separate `AccountBar`/`getMyAccount()` "Account couldn't load" transient stays out of scope** even though it's the same suspected problem class (see clarification 7) — flag any shared-root-cause finding, don't fix it here unasked.

### Current UPDATE files — read before editing

- `src/App.jsx`
  - **Today:** `Hub.listen('auth', refreshAuth)` (lines 162-200) fires `refreshAuth()` unconditionally for every auth Hub event, bumping `authRefreshRevision` on success. A second effect (lines 231-249) re-runs `isAdmin()` whenever `authRefreshRevision` changes and calls `setShowAdminDashboard(false)` on any falsy result. `AdminDashboard` is conditionally rendered (line 673-674), so this unmounts it outright.
  - **Change:** the recheck effect must stop treating "isAdmin() couldn't determine an answer" the same as "isAdmin() confirmed not admin."
  - **Preserve:** `refreshAuth()`'s own authenticated/unauthenticated transitions (lines 163-196) — untouched by this story; the existing `AccountBar` component (lines 707-809) and its independent `getMyAccount()` loading/error/retry states — untouched (clarification 7); the demotion-on-real-removal behavior proven by `AppAuth.test.jsx`'s existing "refreshes Admin navigation..." test.
- `src/utils/adminAuth.js`
  - **Today:** `isAdmin()` returns a plain boolean; any thrown error from `fetchAuthSession()` is caught and mapped to `false`.
  - **Change:** distinguish "confirmed not in the group" from "couldn't determine" in the return value.
  - **Preserve:** the function's single responsibility (read the ID token's `cognito:groups` claim) — do not add retry/backoff logic here; that decision belongs with whoever calls it (Task 3), since a blind retry inside `isAdmin()` itself would just relocate the race, not resolve it.
- `src/utils/adminAuth.test.js`
  - **Today:** asserts `isAdmin()` resolves to a plain boolean in every case, including `false` when `fetchAuthSession()` throws (line 35-38).
  - **Change:** the "fetching the session throws" case must assert the new "unknown" outcome, not `false`. The other fails-closed cases (different groups, non-array groups, missing tokens — lines 26-33) are **confirmed** answers from a session that *did* resolve, so they should still resolve to a definite `false`; do not weaken those.
- `src/AppAuth.test.jsx`
  - **Today:** already mocks `Hub.listen`, `fetchAuthSession`, and `getCurrentUser` extensively, including the exact "refreshes Admin navigation when token group membership changes" test (lines 285-312) that proves real demotion still works, and the general Hub-event-triggers-`refreshAuth` pattern (e.g. lines 78-92, 991-1004).
  - **Change:** add coverage per Task 5; do not restructure the existing mocking setup, which is already the established pattern for this exact scenario class.

### Architecture compliance

- **AD-1:** the fix stays in plain JS/JSX under `src/`; no TypeScript, no new state-management library, no Context introduced for this — `App.jsx` remains the sole owner of auth-derived state (Project Context "React and Client State").
- **AD-9:** this story does not touch authorization enforcement — `Admin`-group AppSync authorization (Story 4.2/4.3's server-side checks) is unaffected; this is purely a client-side presentation/timing fix for when the *client* decides to hide/show admin UI, which was always presentation-only per AD-9's own framing ("UI hiding is presentation; AppSync `Admin` group authorization is enforcement").
- **AD-10/AD-18:** not implicated — no change to what the Admin Dashboard queries or renders as data, only to when it stays mounted.
- No architecture decision in `ARCHITECTURE-SPINE.md` directly governs client-side auth Hub event handling; this story does not require a new AD, since it's a bug fix to existing Story 1.3/1.4/4.1 behavior, not a new capability.

### Testing requirements

- Every new test must be mutation-survivable: shown failing against the pre-fix code before it counts as coverage (Task 1 does this for the core repro; extend the same discipline to Task 5's additions).
- Unit/component tests mock the Amplify auth seam (`fetchAuthSession`, `getCurrentUser`, `Hub.listen`) exactly as `adminAuth.test.js` and `AppAuth.test.jsx` already do — no new mocking pattern needed.
- Preserve `role="status"`/`role="alert"` announcement conventions; this story's fix should make an *existing* status render reliably, not add new announcement copy.
- Do not add a live, real-token-rotation-triggering test to any permanent suite — the race is inherently timing-dependent and not something to depend on CI reproducing; deterministic mocking (Task 1) is both necessary and sufficient for coverage here.

### Previous story intelligence

- **Story 4.1:** established the `Admin` group, `adminMetrics`, the App/AppAuth hidden-nav gate, and — critically — added the very re-check-on-token-refresh effect this story is now hardening, specifically because its own review "required admin state to re-evaluate on token refresh." That original requirement (AC3 here) is correct and must not regress; this story narrows *when* the re-check demotes, not whether it ever should.
- **Story 4.2:** established the thin-utility + injectable-component + one-dashboard-integration-assertion pattern this story's Task 5 should follow. Its own live run revealed an Amplify resolver-shape surprise, reinforcing "trust deployed/live behavior over assumed types" — relevant here too, since the Amplify Hub/token-refresh internals researched above (Dev Notes "Latest technical information") are read from the installed package source, not assumed from docs.
- **Story 4.3:** the story that discovered this bug. Independently proved `Config.update`'s own correctness live (AppSync-console checks), isolating the defect to the admin-status recheck path rather than anything Config-related — this story inherits that isolation and must not re-litigate Config's correctness. Also the origin of "Story close-out must paste real Git output, not prose" and "every new test must fail against a wrong implementation first," both carried into this story's tasks.

### Git intelligence

Recent relevant history:

- `0d9b324` — `docs: record story 4.3 code-review git evidence`
- `2568d40` — `fix: address story 4.3 code review findings (two rounds)`
- `fef5928` — `docs: record story 4.3 git evidence`
- `53933cc` — `feat: let admin edit daily limit and monthly budget without a deploy (story 4.3)`
- `f95a334` — `fix: harden invite-key-mint field-name routing per code review`

This is a bug-fix story, not a new vertical slice — `fix:` is the appropriate commit-message prefix for the implementation commit (matching `f95a334`/`2568d40`'s precedent for review/bug fixes, as distinct from `feat:` for new capability).

### Latest technical information (verified 2026-09-25 against the installed package)

- Installed `aws-amplify` is `6.18.0` (`node_modules/aws-amplify/package.json`); this story's fix is against that exact version's behavior, not a newer/older one.
- `@aws-amplify/core`'s `AuthHubEventData` type (`node_modules/@aws-amplify/core/dist/esm/Hub/types/AuthTypes.d.ts`) enumerates every event the `'auth'` Hub channel can dispatch: `signInWithRedirect`, `signInWithRedirect_failure`, `tokenRefresh`, `tokenRefresh_failure`, `customOAuthState`, `signedIn`, `signedOut`. `App.jsx`'s current listener ignores `payload.event` entirely and reacts to all of them identically.
- `@aws-amplify/auth`'s `TokenOrchestrator.getTokens()` (`node_modules/@aws-amplify/auth/src/providers/cognito/tokenProvider/TokenOrchestrator.ts`) only deduplicates concurrent calls during an **OAuth** in-flight redirect (`waitForInflightOAuth()`); a plain expired-token refresh has no equivalent lock, so two near-simultaneous `fetchAuthSession()` callers can each independently trigger a real Cognito refresh call. `TokenOrchestrator.refreshTokens()` dispatches `Hub.dispatch('auth', { event: 'tokenRefresh' })` on each independent success and `tokenRefresh_failure` (carrying the real `AuthError`) on each independent failure — this is the confirmed mechanism by which `isAdmin()`'s `fetchAuthSession()` call could throw for a real admin purely from race timing, distinct from any actual group-membership change.
- `fetchAuthSession()`'s own doc comment (`node_modules/@aws-amplify/core/dist/esm/singleton/apis/fetchAuthSession.d.ts`) confirms it auto-refreshes expired tokens by default and accepts `{ forceRefresh: true }` — not needed for this fix, but relevant if the dev agent considers whether `isAdmin()` should ever force a fresh read rather than trusting a possibly-stale cached session.
- Do not upgrade `aws-amplify` or any dependency to chase a fix; this is a client-code timing/error-handling defect, not a library defect, and Story 4.3's Dev Notes already established "do not upgrade dependencies" as this project's default posture absent a specific reason.

### Project Structure Notes

Likely-modified files:

- `src/App.jsx`
- `src/utils/adminAuth.js`
- `src/utils/adminAuth.test.js`
- `src/AppAuth.test.jsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-5-fix-intermittent-admin-status-false-negative-on-auth-hub-events.md` (this file)

Expected no-change files:

- `src/components/AdminDashboard.jsx`, `src/components/AdminConfigEditor.jsx`, `src/components/MintInviteKey.jsx` — the mutations themselves are proven correct; this story fixes the surrounding admin-status recheck, not these components (unless Task 4's AC4 investigation concludes coordination code belongs in `AdminDashboard.jsx`, in which case flag it before building it).
- `src/utils/account.js`, `AccountBar` inside `src/App.jsx` — clarification 7, out of scope.
- `amplify/**` — no backend involvement; this is purely a client-side Amplify Auth/Hub timing fix.
- `e2e/**` — an inherently intermittent auth-race is not a good candidate for a new permanent Playwright scenario; Vitest-level mocked reproduction (Task 1) is the required coverage.

### References

- [Source: `_bmad-output/implementation-artifacts/4-3-adjust-the-daily-limit-and-monthly-budget-without-a-deploy.md#Dev-Agent-Record`] — the live verification session where this was observed and where Config.update's own correctness was independently confirmed; also the origin of the "paste real git output" and "mutation-survivable tests" conventions this story's tasks follow.
- [Source: `_bmad-output/implementation-artifacts/epic-2-retro-2026-07-17.md#Action-Items`, item 9] and [Source: `_bmad-output/implementation-artifacts/epic-3-retro-2026-07-26.md#Epic-4-Preparation-Tasks`] — the open "Classify the 'Account couldn't load' transient" action item this story's reproduction most likely explains (for `isAdmin()`'s path specifically; `AccountBar`'s own transient remains separately open per clarification 7).
- [Source: `src/App.jsx:162-200`, `:231-249`, `:673-674`] — the Hub listener, the admin-recheck effect, and the conditional `AdminDashboard` render this story modifies.
- [Source: `src/utils/adminAuth.js:1-11`] — `isAdmin()`'s current blanket fail-closed behavior.
- [Source: `src/components/AdminConfigEditor.jsx:50-52`, `:78`, `:84`] — the `mounted.current` guard that silently absorbs the stale-update attempt when the dashboard unmounts mid-save; explains why no console error accompanied the symptom.
- [Source: `src/AppAuth.test.jsx:285-312`] — the existing "refreshes Admin navigation when token group membership changes" test that AC3/this story must not regress.
- [Source: `src/utils/adminAuth.test.js:35-38`] — the specific existing assertion (`resolves.toBe(false)` on a thrown session error) that this story's Task 2 deliberately changes.
- [Source: `node_modules/@aws-amplify/core/dist/esm/Hub/types/AuthTypes.d.ts`] — the full `AuthHubEventData` event-name enumeration for the `'auth'` Hub channel.
- [Source: `node_modules/@aws-amplify/auth/src/providers/cognito/tokenProvider/TokenOrchestrator.ts`] — `getTokens()`/`refreshTokens()`/`handleErrors()`, the confirmed unsynchronized-concurrent-refresh mechanism.
- [Source: `node_modules/@aws-amplify/core/dist/esm/singleton/apis/fetchAuthSession.d.ts`] — `fetchAuthSession()`'s documented auto-refresh/`forceRefresh` behavior.
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md#AD-1`, `#AD-9`] — frontend-stack and authorization-is-presentation-vs-enforcement invariants this fix stays within.
- [Source: `_bmad-output/project-context.md#React-and-Client-State`] — "do not introduce Context or an external state library without an explicit architecture decision," honored by keeping this fix inside `App.jsx`'s existing state.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Baseline (Task 0, HEAD `0d9b324`, Node 24.9.0): `npm test -- --run` 362/362 (32 files); `npm run lint`, `npm run typecheck`, `npm run build` all clean (pre-existing >500kB chunk-size warning, unrelated).
- Task 1 repro: added "does not close the Admin Dashboard on a transient session-read failure for a genuine admin" to `src/AppAuth.test.jsx`. Ran alone against the unmodified baseline — failed exactly as predicted: the `Admin Dashboard` heading disappeared after the mocked transient `fetchAuthSession` rejection, confirming the hypothesis before any fix was written.
- Task 2: `src/utils/adminAuth.js`'s `isAdmin()` now returns `null` (not `false`) when `fetchAuthSession()` itself throws; a resolved-but-non-admin session still resolves `false`. Updated `src/utils/adminAuth.test.js`'s "fetching the session throws" case accordingly; all 5 tests in that file pass.
- Task 3: `src/App.jsx`'s admin-recheck effect (`isAdmin().then(...)`) now returns early on `admin === null`, leaving both `isAdminUser` and `showAdminDashboard` untouched on an inconclusive recheck. Did not implement `payload.event` filtering on the Hub listener — the unknown/false distinction alone already resolves the observed bug (proven by Task 1's now-passing test) and adding event-name filtering would touch `refreshAuth()`'s shared Hub callback for a marginal reduction in *how often* the recheck fires, not a behavior this story's ACs require. Recorded as a deliberate scope boundary, not an oversight.
- Task 4: confirmed via the new "still renders a Save Cost Controls result after a transient session-read failure mid-save" test that Tasks 2–3 alone satisfy AC4 for the observed case. Verified both new tests are mutation-survivable by running `git stash push -- src/App.jsx src/utils/adminAuth.js`, re-running the two tests (both failed, one on the dashboard staying open, one — same assertion — on the dashboard closing before the save could resolve), then `git stash pop` to restore the fix.
- Full suite after all changes: `npm test -- --run` 364/364 (32 files, up from 362 — the two new tests); `npm run lint`, `npm run typecheck`, `npm run build` clean; `npm run test:e2e` 2/2 (unauthenticated `public-landing` project only — no `TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD` in this environment, same limitation recorded in Story 4.3).
- Credential/personal-content sweep: `git diff` across all changed files shows no secrets, tokens, or personal Context/Guide content — confirmed by grep and manual read of every changed hunk.
- Committed and pushed. `git status --short` (post-commit): empty. `git log -1 --oneline --decorate`: `1b1e749 (HEAD -> main) fix: stop demoting a real admin on a transient auth-session read (story 4.5)`. Pushed to `origin/main`: `0d9b324..1b1e749  main -> main`.

### Completion Notes List

- All four ACs (1–4) satisfied for the confirmed root cause: `isAdmin()`'s blanket `catch { return false }` conflated a transient session-read failure (concurrent Cognito token refresh, per the confirmed `TokenOrchestrator` mechanism in Dev Notes) with a genuine Admin-group removal. The fix distinguishes the two (`null` = unknown, never demotes) without touching `Config.update`, `AdminConfigEditor`, `MintInviteKey`, or any backend/authorization code — exactly as scoped.
- AC3 (real demotion still closes the dashboard) is provably unregressed: the pre-existing "refreshes Admin navigation when token group membership changes" test passed unmodified, and its mock never throws (only returns definite `[]`/`['Admin']` arrays), so it was never at risk from the `null` branch.
- **AC4 open design question for Tony (Task 4, clarification 6):** the fix fully covers the *observed* case (a false-negative demotion). It does **not** add any new coordination for the separate, much rarer case of a **genuine** Admin-group removal landing in the exact window while a Save/Mint mutation is in flight — that combination isn't something this story's fix touches, and building it would be a UX decision, not a bug fix. Three options, not implemented, for your call if this ever matters in practice:
  1. **Do nothing further (recommended default).** A real admin demotion racing your own concurrent dashboard action, within the same few-hundred-millisecond window, is an extremely narrow edge case for a single-admin hobby app — you would be removing your own access at the exact moment you're using it. Leave as a documented, accepted limitation.
  2. **Defer closing until no mutation is in flight.** Have `AdminDashboard` expose (e.g. via a ref or callback) whether a child mutation is pending; `App.jsx`'s demotion effect would wait for it to clear before calling `setShowAdminDashboard(false)`. Adds real plumbing across `App.jsx`/`AdminDashboard.jsx` for a case that may never occur.
  3. **Close immediately but show a one-time notice.** Let the mutation's result render as it does today, then transition to a distinct "You're no longer an admin" screen instead of silently returning to Context Entry. More UI work for the same rare case.
  - No action taken; flagging per this story's own instruction not to silently pick a UX behavior here.
- The separate `AccountBar`/`getMyAccount()` "Account couldn't load" transient (Epic 2 retro item, clarification 7) was **not** investigated or touched in this story — it's a different function against a different backend (AppSync `Account.list()`, not Cognito `fetchAuthSession()`), and nothing in this story's investigation surfaced a shared root cause requiring escalation. It remains a separately open item.

### File List

- `src/App.jsx` (modified)
- `src/utils/adminAuth.js` (modified)
- `src/utils/adminAuth.test.js` (modified)
- `src/AppAuth.test.jsx` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
- `_bmad-output/implementation-artifacts/4-5-fix-intermittent-admin-status-false-negative-on-auth-hub-events.md` (this file)

## Change Log

- 2026-09-23: Bug filed directly from a live reproduction during Story 4.3's Task 8 verification; not yet triaged/dev'd. Root cause recorded as a hypothesis, not a confirmed diagnosis.
- 2026-09-25: Promoted to `ready-for-dev` via the BMad create-story workflow. Added a priority signal (this violates Story 4.3's own AC10 in production today), the confirmed supporting mechanism from reading the installed `aws-amplify@6.18.0` source (`TokenOrchestrator`'s lack of concurrent-refresh deduplication, and the full `AuthHubEventData` event enumeration), the investigation-first task sequence (reproduce deterministically before fixing), the tri-state `isAdmin()` contract change and its impact on existing test coverage, an explicit scope boundary against the separate `AccountBar`/`getMyAccount()` transient, and the AC4 real-demotion-mid-save edge case flagged as a design decision for Tony rather than a silently-assumed UX call.
- 2026-09-25 (dev): Implemented via `bmad-dev-story`. Confirmed the root cause deterministically (Task 1) before fixing: `isAdmin()` now resolves `null` for an unreadable session instead of collapsing it to `false`, and `App.jsx`'s admin-recheck effect ignores `null` instead of demoting on it. Verified the pre-existing real-demotion regression test still passes unmodified, and proved both new tests mutation-survivable via a temporary revert. Full suite 364/364, lint/typecheck/build clean, e2e 2/2 (unauthenticated only, as in Story 4.3). Left the rare "genuine demotion lands mid-save" edge case unimplemented with three options written up for Tony (see Dev Agent Record → Completion Notes) rather than guessing the UX. Moved to `review`.
