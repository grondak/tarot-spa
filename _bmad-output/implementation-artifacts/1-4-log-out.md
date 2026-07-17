---
baseline_commit: 3bb93394b1991e4f33c2f6d3bd4604c1526b6417
---

# Story 1.4: Log out

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an authenticated Account holder,
I want to log out,
so that I can end my session on a shared or public device.

*(No PRD FR number — surfaced during party-mode review of the epics: every authenticated app needs a way to end a session.)*

This is a **frontend-only story — zero `amplify/` changes.** The whole story is: one always-available Log Out button in the `AccountBar`, one `signOut()` call, App-level state reset, tests, live verify. It is deliberately the smallest story in the epic — resist inventing scope (no confirmation dialog, no "signed out" toast, no global sign-out option, no session-expiry handling).

## Acceptance Criteria

1. **Given** an authenticated user selects "Log Out", **when** the action completes, **then** their session is terminated and they're returned to the Public Landing page. *(Public Landing is Story 2.1 and doesn't exist yet — the honest interim destination is the unauthenticated surface. **This story lands them on the LogIn screen: `setAuthScreen('login')`.** A person who just logged out is an existing account holder, and LogIn is the natural return point. When 2.1 ships, Public Landing takes over as the destination — don't build anything speculative for that now.)*
2. **Given** a logged-out user, **when** they navigate to an authenticated URL, **then** they're redirected to login rather than shown authenticated content. *(No router — this app has one URL, same translation as Story 1.3's AC 3: after logging out, a **page reload** must land on the unauthenticated surface with no authenticated content flash. `signOut()` clears the local Cognito tokens, so `App.jsx`'s `getCurrentUser()`-on-mount rejects → `unauthenticated`. Note the reload lands on SignUp — `authScreen` defaults to `'signup'` and resets on reload; that's fine, the AC's substance is "no authenticated content," and SignUp carries a visible "Already have an account? Log in" link.)*
   **Do NOT persist `authScreen` to localStorage or add a router to "fix" the reload-lands-on-SignUp wrinkle.**

[Source: epics.md#Story-1.4]

## Copy (exact strings)

| Element | Exact string |
|---|---|
| Log Out button label | `Log Out` |
| Log Out button while busy | `Logging out…` |

No error copy: sign-out never surfaces an error to the user (Task 1's unconditional-transition rule). No confirmation prompt — EXPERIENCE.md specs Log Out as "a single action, no new visual pattern."

## Tasks / Subtasks

- [x] **Task 1: Add the Log Out button to `AccountBar` in `src/App.jsx`** (AC: 1)
  - [x] Import `signOut` from `aws-amplify/auth` in `App.jsx` (alongside the existing `getCurrentUser` import).
  - [x] Give `AccountBar` DI props following the established seam pattern: `signOutFn = signOut`, `onSignedOut = () => {}`. (App currently renders bare `<AccountBar />` and `App.test.jsx` renders it bare too — the defaults keep both working.)
  - [x] **The button must render in ALL four load states** (loading / ready / missing / error). Logging out must never depend on the Account record having loaded — a user on a shared device with a broken account fetch still needs out. Restructure the header's right side into one flex group (`flex items-center gap-3`) holding the state-dependent element first and the Log Out button always last, so the existing `justify-between` layout keeps label-left / actions-right.
  - [x] Button treatment: match the existing quiet gray AccountBar button exactly (the "Retry account" classes): `rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`, `type="button"`. Add `disabled:cursor-wait disabled:opacity-60` for the busy state (the disabled treatment used by SignUp/LogIn buttons).
  - [x] Click handler: the established `busy` + `useRef` double-submit guard from `LogIn.jsx` — suite convention; the ref covers the window before the `busy` re-render disables the button. While in flight: button disabled, label swaps per Copy table. Then `try { await signOutFn() } catch { /* swallow — see Dev Notes */ } finally { onSignedOut() }`. **`onSignedOut()` fires unconditionally** — never leave the user stranded on the authenticated screen because token revocation hiccupped. (This is the canonical statement of the unconditional-transition rule; other sections point here.)
- [x] **Task 2: Wire the App-level reset** (AC: 1, 2)
  - [x] In `App`, pass `onSignedOut` to `<AccountBar />`: a handler that does `setAuthState('unauthenticated')`, `setAuthScreen('login')`, `setSpreadKey(null)`, `setCards([])`.
  - [x] **The draw-state reset is a real requirement, not tidiness:** `spreadKey`/`cards` live in `App` and survive `AccountBar` unmounting. Without the reset, the next person to log in on that shared device sees the previous user's drawn cards — exactly the scenario this story exists for.
  - [x] The `Hub.listen('auth', refreshAuth)` in `App.jsx` will also fire on Amplify's `signedOut` event and call `getCurrentUser()` → reject → `setAuthState('unauthenticated')`. Benign race with the explicit callback, same pattern as 1.3's `onSignedIn` — keep the explicit callback for determinism and because Hub doesn't reset the draw state or `authScreen`.
  - [x] **Preserve untouched:** the `loading` gate, the SignUp/LogIn toggle behavior, all `AccountBar` retry states, `GrantInviteKey`, and the spread flow handlers. `App.test.jsx` and `AppAuth.test.jsx` pin much of this.
- [x] **Task 3: Fix the module-mock regression in `src/AppAuth.test.jsx`** (AC: —, prerequisite for Task 4)
  - [x] `AppAuth.test.jsx` mocks the whole `aws-amplify/auth` module with a factory listing only `confirmSignUp`/`getCurrentUser`/`signIn`/`signUp`. **The moment `App.jsx` imports `signOut`, that factory must also export `signOut: vi.fn()`** or every test in the file fails on an undefined import. Do this in the same change that adds the import. (`App.test.jsx` doesn't mock `aws-amplify/auth` at all — importing `signOut` there is harmless since `AccountBar`'s default is only *referenced*, and the new tests will use the DI prop.)
- [x] **Task 4: Tests** (AC: all)
  - [x] `AccountBar` unit tests (extend the existing `describe` in `src/App.test.jsx`, same style — DI props, label/role queries, `waitFor` to settled states):
    - Log Out button visible in **all four load states**. Ready and error get their own assertions — for ready, use a `{ generation: 'SecondGen', onwardKeyGenerated: false }` account like the existing tests so `GrantInviteKey` stays quiet. Loading and missing are cheap: the existing first AccountBar test already passes through both states — add the button assertion at each stop.
    - Click → `signOutFn` called exactly once and `onSignedOut` fired after it resolves. Also assert `signOutFn` was called with **no arguments** (`toHaveBeenCalledWith()`) — pins the non-global default from Dev Notes.
    - `signOutFn` **rejects** → `onSignedOut` still fired (pins the unconditional transition).
    - Double-click while in flight → exactly one `signOutFn` call. Use a controlled unresolved promise for `signOutFn`, and while it's pending also assert the button is disabled and reads `Logging out…` (pins the Copy table's busy label). End clean: resolve the controlled promise and `waitFor` `onSignedOut` to have fired exactly once — don't leave the test with a pending promise mid-flight.
    - Optional but cheap layout pin: render with a `{ generation: 'FirstGen', onwardKeyGenerated: false }` account and assert both the "Grant Invite Key" and "Log Out" buttons are present — the one automated check of the new flex group next to its widest neighbor (Task 5's live verify can't reach that state with Tony's account).
  - [x] App-level round-trip test in `src/AppAuth.test.jsx`. Put it in a **new `describe` block with its own `beforeEach`** — the existing block's `beforeEach` sets `getCurrentUser.mockRejectedValue` (unauthenticated), and this test needs the opposite. Add `vi.mock('./utils/account', () => ({ getMyAccount: vi.fn() }))` at module level — the authenticated branch mounts `AccountBar`; existing tests in the file are unauthenticated-only, so the new mock doesn't disturb them. Configure the mocks by importing them from the mocked modules, mirroring how the existing test imports `getCurrentUser`: add `signIn`, `signOut` to the `'aws-amplify/auth'` import and import `{ getMyAccount }` from `'./utils/account'`. Steps:
    1. Arrange (in the new block's `beforeEach`, reset each mock before configuring so call counts don't bleed between tests): `getCurrentUser` resolves; `getMyAccount` uses **`mockResolvedValue`, NOT `mockResolvedValueOnce`** (AccountBar unmounts at logout and remounts at re-login, so it fetches twice — a `Once` mock leaves the second mount calling a bare `vi.fn()` and crashing on `undefined`) with the SecondGen fixture; `signOut` resolves; `signIn` resolves `{ isSignedIn: true }`.
    2. Render `<App />` → **await** the authenticated home (`findBy*` — the mount's `getCurrentUser` resolves asynchronously).
    3. Click a spread button so `SpreadView` shows. **Query with a regex or `getByText`** — the spread buttons' accessible name concatenates label + description + card count, so an exact `getByRole('button', { name: 'Single Card' })` finds nothing; use `{ name: /Single Card/ }` (labels live in `SPREADS`, `src/utils/deck.js`).
    4. Click "Log Out" → **`await screen.findByRole('heading', { name: 'Log in' })`** (LogIn's `h1` — AC 1's destination). The transition lands only after the awaited `signOut` resolves, so a synchronous `getBy*` fires too early — `findBy*` is required. Also pin AC 2's substance: `expect(screen.queryByText('Your account')).not.toBeInTheDocument()`.
    5. Fill and submit the mocked login → **assert the SpreadSelector renders, not the previous SpreadView**: `await screen.findByRole('heading', { name: 'Systems Thinking Tarot' })` (SpreadSelector's `h1`), pinning the draw-state reset.
  - [x] Full suite green: all 42 existing tests + new ones; `npm run lint`, `npm run typecheck`, `npm run build` all pass.
- [x] **Task 5: Live sandbox verification** (AC: 1, 2)
  - [x] No backend deploy (nothing under `amplify/` changes) — `npm run dev` against the existing `tonyreynolds` sandbox.
  - [x] Log in as Tony's real account → draw a spread → click Log Out → land on the LogIn screen (AC 1); confirm no account/draw content visible and no SignUp flash on the way there (Amplify's Hub `signedOut` event can race the explicit callback by a frame — same final state, but eyeball it).
  - [x] Narrow the viewport while authenticated and confirm the header's right-side group (account status/actions + Log Out) wraps gracefully. Note: Tony's account shows the compact already-granted text — `GrantInviteKey`'s widest state (the minted-code display with its `flex-wrap` block) won't appear with this account; eyeball the states you can reach.
  - [x] Reload the page after logging out → unauthenticated surface (SignUp), no authenticated flash (AC 2).
  - [x] Log back in → authenticated home with a fresh SpreadSelector (no leftover cards) and the AccountBar's already-granted key state (expected from 1.2's live mint — not a bug).
  - [x] DevTools check: after Log Out, localStorage holds no `CognitoIdentityServiceProvider` token entries.

### Review Findings

- [x] [Review][Patch] Sequence overlapping authentication refreshes so a stale Hub result cannot overwrite a newer logout or login transition [src/App.jsx:19]
- [x] [Review][Patch] Add responsive wrapping and shrink constraints to the AccountBar action cluster so the implementation matches the completed narrow-viewport requirement [src/App.jsx:149]
- [x] [Review][Patch] Assert the App-level logout round trip actually invokes Amplify `signOut`, preventing a UI-only logout regression [src/AppAuth.test.jsx:61]
- [x] [Review][Patch] Make the loaded-account test wait for the ready state before asserting Log Out visibility [src/App.test.jsx:58]
- [x] [Review][Patch] Replace the unresolved agent-model template placeholder in the Dev Agent Record [_bmad-output/implementation-artifacts/1-4-log-out.md:134]
- [x] [Review][Patch] Refresh obsolete `App.jsx` line references in the story's implementation notes [_bmad-output/implementation-artifacts/1-4-log-out.md:95]
- [x] [Review][Defer] Remove and rotate the real unredeemed invite key recorded in repository artifacts [_bmad-output/implementation-artifacts/1-4-log-out.md:103] — deferred, pre-existing

## Dev Notes

### What already exists — do not rebuild any of this

- **The entire auth state machine** is in `App.jsx:12-105` (interleaved with the draw handlers at 34-56) — `authState` (`loading`/`unauthenticated`/`authenticated`), `authScreen` (`signup`/`login`), `getCurrentUser()`-on-mount + `Hub.listen('auth', refreshAuth)`. This story only adds one transition to it.
- **`AccountBar`** is exported from `App.jsx` (`App.jsx:107-195`), header with `justify-between`, label left, state-dependent right side (`GrantInviteKey` when ready; status only while loading; status + retry for missing/error). Its tests in `App.test.jsx` mock only `./utils/account` and must keep passing.
- **Busy-guard + DI-props + quiet-button patterns** are established in `SignUp.jsx`/`LogIn.jsx`/`GrantInviteKey.jsx`. Copy LogIn's `busy` state + `useRef` guard shape (Task 1) and its visual disabled treatment; there's no form here, so it's an `onClick` handler rather than `onSubmit`. Note: LogIn's `finally { setBusy(false) }` shape means a setState lands after `onSignedOut()` has unmounted `AccountBar` — harmless in React 18+ (no warning, no leak); don't "fix" it with an isMounted guard.
- **Session restore on reload** (`getCurrentUser` on mount) is what makes AC 2 pass for free once tokens are cleared — don't touch it.

### `signOut()` — Amplify v6 specifics

- `import { signOut } from 'aws-amplify/auth'`; call as plain `signOut()` — **default (non-global) scope**: clears this device's local Cognito tokens (localStorage) and revokes the refresh token; already-issued tokens on *other* devices stay valid up to their 1-hour expiry (accepted — the shared-device threat is this device). **Do NOT pass `{ global: true }`.**
- v6's `signOut` catches token-revocation failures internally and clears local state regardless, so it effectively doesn't reject in this app's flow (no OAuth involved) — keep Task 1's `try/catch` + unconditional `finally` anyway; worst case is a server-side refresh token lingering until expiry. Verify the localStorage clear live (Task 5) rather than trusting this note.
- Amplify emits `signedOut` on the Hub `auth` channel after sign-out — that's the benign race noted in Task 2.

### Constraints & scope guards

- **Zero backend changes.** No `amplify/` edits, no new mutations, no schema changes. If an idea needs `amplify/`, it's the wrong idea for this story.
- **No router, no localStorage persistence of UI state, no confirmation dialog, no toast, no "log out everywhere" option, no session-expiry countdown.** EXPERIENCE.md: Log Out is "a single action, no new visual pattern," spine-only (no mock exists — the AccountBar button treatment above IS the spec).
- **No Ornamental Divider** (exclusive to the two LLM-touching screens, UX-DR3).
- **Frontend conventions bind:** plain JSX in `src/`, default exports for components, `useState`/`useEffect` plus `useRef` for Task 1's double-submit guard, prop-drilling, exact dark tokens, Tailwind utilities inline, minimal comments. `AccountBar` stays in `App.jsx` — do not extract it to its own file in this story.
- An in-flight `GrantInviteKey` mint when Log Out is clicked needs no special handling: the mint is server-side atomic (AD-17) and the Account record is authoritative on next login.

### Previous story intelligence (1.3, GPT-5 Codex dev agent)

- Final state: 42 tests passing; lint/typecheck/build green; live-verified 2026-07-12. Files this story touches were last shaped by 1.3: `App.jsx` (auth toggle), `AppAuth.test.jsx` (module mocks — see Task 3's regression flag), `LogIn.jsx`.
- 1.3's code review added a guard for **non-Error rejections** (optional-chained `error?.name`) — the same defensiveness applies here and is already satisfied by the swallow-everything catch.
- Established test bar from 1.2/1.3: `waitFor` to settled states (no mid-transition assertions), DI mocks over module mocks where a seam exists, label/role queries, App-level tests must prove App actually switches screens (component-level callback tests don't count).
- Tony's sandbox account state: `onwardKeyGenerated: true` (1.2's live mint, code redacted) — the AccountBar shows the already-granted state during live verification; expected, not a bug.

### References

- [Source: epics.md#Story-1.4] — story + ACs
- [Source: EXPERIENCE.md#Information-Architecture] — "Log Out: Account/profile area, any authenticated surface. End the session, return to Public Landing. Spine-only (no mock) — a single action, no new visual pattern"
- [Source: ARCHITECTURE-SPINE.md#AD-1] — frontend stack frozen; no router
- [Source: _bmad-output/implementation-artifacts/1-3-log-in-to-an-existing-account.md] — auth-screen toggle, DI/test patterns, Hub benign-race precedent, live-verify approach
- [Source: _bmad-output/implementation-artifacts/1-1-redeem-an-invite-key-to-create-an-account.md#Review-Findings] — never-fake-auth rule (inverse applies here: never fake a *still*-authenticated state after the user asked out)
- [Source: project-context.md] — component/util conventions, dark tokens, no-comments style
- [Source: docs.amplify.aws — Sign-out (Gen 2, React)] — default vs `global: true` semantics; other-device tokens valid ≤1h after non-global sign-out

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-07-13: Confirmed the new tests fail before implementation, then pass after implementation.
- 2026-07-13: Live sandbox verification blocked because the in-app browser connection was unavailable.
- 2026-07-13: Tony completed live sandbox verification manually: authenticated logout returned directly to Log In with the busy label visible, removed authenticated/draw content and Cognito localStorage entries, reload opened Sign Up without an authenticated flash, re-login opened a fresh SpreadSelector with the expected already-granted AccountBar state, and a DevTools-assisted narrow viewport confirmed clean wrapping with 20px separation and no clipping.
- 2026-07-13: Code review applied all six patches; added auth-refresh sequencing and regression coverage, explicit responsive wrapping, stronger logout/ready-state assertions, and story-record cleanup. Final gate: 49 tests, lint, typecheck, and build pass.

### Completion Notes List

- Added an always-available guarded Log Out action that transitions even when Amplify sign-out rejects.
- Reset authentication screen and draw state at App level after logout.
- Added AccountBar state/behavior coverage and an authenticated logout-login round-trip test.
- Automated validation passes: 49 tests, lint, typecheck, and production build.
- Live sandbox verification passes AC 1–2, including token removal, reload protection, draw-state reset, and responsive AccountBar wrapping.
- Adversarial code review completed with all six actionable patches resolved; one pre-existing invite-key exposure remains tracked in deferred work.

### File List

- _bmad-output/implementation-artifacts/1-4-log-out.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/App.jsx
- src/App.test.jsx
- src/AppAuth.test.jsx

### Change Log

- 2026-07-13: Implemented and automated-tested logout; live sandbox verification remains pending.
- 2026-07-13: Completed live sandbox verification and moved Story 1.4 to review.
- 2026-07-13: Applied all code-review patches and moved Story 1.4 to done.
