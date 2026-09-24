---
created: 2026-09-23
origin: discovered during Story 4.3 live verification, not from epics.md
---

# Story 4.5: Fix intermittent Admin-status false-negative on Amplify auth Hub events

Status: backlog

## Story

As Tony,
I want the Admin Dashboard to stay open and reliably show the outcome of an action I take on it,
So that an authenticated Cognito token refresh happening mid-action doesn't silently kick me out or swallow the result.

**Not from `epics.md`.** This is a bug discovered live during Story 4.3's Task 8 verification, reproduced once, and not yet root-caused with certainty. It reinforces — with a much more specific trigger — the still-open Epic 2 retro action item "Classify the 'Account couldn't load' transient" and the matching Epic 3 retro carry-forward.

## Observed symptom (2026-09-23, live sandbox)

1. Tony, signed in as the sole `Admin` group member (`grondak@gmail.com`), opened the Admin Dashboard, edited the daily limit to `7` in `AdminConfigEditor`, and clicked "Save cost controls."
2. The button switched to "Saving…", then the whole Admin Dashboard disappeared and the app returned to the main authenticated view. No success status (`role="status"`, "Cost controls saved.") and no error (`role="alert"`) ever rendered.
3. Re-opening the Admin Dashboard confirmed the save had actually succeeded server-side: `dailyLimit` was `7`. The underlying `Config.update` mutation, its authorization, and its validation are not implicated — see Story 4.3's Dev Agent Record, where the same mechanism was independently proven correct via direct AppSync-console mutations (wrong-id rejected with `ConditionalCheckFailedException`; out-of-range rejected with the exact frozen validation message).
4. Immediately after, clicking "Mint Key" on the same dashboard (Story 4.2's action, also an authenticated Data mutation) completed normally with no kick-out.

## Working root-cause hypothesis (unconfirmed — first task is to verify or refute this)

`src/App.jsx` has a `Hub.listen('auth', refreshAuth)` effect (added for Story 1.3/1.4) that calls `getCurrentUser()` on **every** Amplify auth Hub event — including a routine, successful token refresh, not just sign-in/sign-out. A successful `refreshAuth()` run bumps `authRefreshRevision`, which is a dependency of a second effect (added in Story 4.1's review) that re-runs `isAdmin()` (`src/utils/adminAuth.js`) and calls `setShowAdminDashboard(false)` whenever it comes back `false`.

`isAdmin()` calls `fetchAuthSession()` and reads `session.tokens?.idToken?.payload?.['cognito:groups']`; **any** thrown error is caught and mapped to `false` — there is no distinction between "confirmed not in the Admin group" and "transient failure to read the session mid-refresh." If `fetchAuthSession()` is called while a token rotation is in flight (plausible if the mutation itself triggered the refresh), it may transiently throw or return an ID token whose payload hasn't caught up yet, producing a false negative for a real admin.

This would explain why Mint Key — issued once the token was already fresh from the earlier refresh — didn't retrigger the race, while Config's Save did, purely by chance of timing rather than anything specific to Config.update.

## Acceptance Criteria (draft — refine before dev)

1. **Given** an authenticated Account who is genuinely in the `Admin` group, **when** any Amplify auth Hub event fires during their session (including a routine token refresh triggered by an authenticated mutation), **then** the Admin Dashboard does not close and no in-flight action's result is lost.
2. **Given** the admin-status recheck cannot get a definitive answer (transient/mid-refresh error), **when** deciding whether to close the dashboard, **then** the app treats "unknown" differently from "confirmed not Admin" and does not demote/exit on "unknown."
3. **Given** an Account is genuinely removed from the `Admin` group, **when** the next legitimate recheck runs, **then** the dashboard still closes — this story must not regress Story 4.1's original requirement.
4. **Given** any authenticated mutation issued from the Admin Dashboard (Save cost controls, Mint Key, and future writes), **when** a token refresh happens concurrently, **then** the mutation's own success/failure status still renders to the user.

## Suggested investigation entry points

- `src/App.jsx`: the `Hub.listen('auth', refreshAuth)` effect and the `isAdmin()`-recheck effect (dependency: `authRefreshRevision`).
- `src/utils/adminAuth.js`: `isAdmin()`'s blanket `catch { return false }`.
- Reproduce deliberately: force a token refresh mid-mutation (e.g., temporarily shorten the Cognito access-token validity in a throwaway sandbox, or intercept `fetchAuthSession` in a test) rather than relying on incidental timing.
- Check whether Amplify's Hub 'auth' channel event payload (`payload.event`) can distinguish `tokenRefresh` from `signedOut`/`tokenRefresh_failure` — if so, the simplest fix may be to only re-run the `isAdmin()` recheck on events that could plausibly change group membership, not on every successful refresh.

## Out of scope

- Do not touch `amplify/data/resource.ts`, Config authorization/validation, or anything else Story 4.3 owns — that logic is independently verified correct.
- Do not weaken the Story 4.1 requirement that a real Admin-group removal still closes the dashboard.

## References

- [Source: `_bmad-output/implementation-artifacts/4-3-adjust-the-daily-limit-and-monthly-budget-without-a-deploy.md#Dev-Agent-Record`] — live verification session where this was observed and where Config.update's own correctness was independently confirmed.
- [Source: `_bmad-output/implementation-artifacts/epic-2-retro-2026-07-17.md`] and [Source: `_bmad-output/implementation-artifacts/epic-3-retro-2026-07-26.md`] — open action item "Classify the 'Account couldn't load' transient," which this reproduction most likely explains.
- `src/App.jsx` (Hub listener, `isAdmin` recheck effect), `src/utils/adminAuth.js`.

## Dev Agent Record

### Completion Notes List

- Filed 2026-09-23 directly from a live reproduction during Story 4.3's Task 8 verification; not yet triaged/dev'd. Root cause above is a hypothesis, not a confirmed diagnosis — first dev task should be reproducing it deterministically before writing a fix.
