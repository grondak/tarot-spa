---
baseline_commit: be6ba6c080fa7b6f2fd19deed6a7d58827109b45
---

# Story 1.3: Log in to an existing Account

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Account holder who has already signed up,
I want to log in with my credentials,
so that I can return to my authenticated home without redeeming a key again.

This is a **frontend-only story — zero `amplify/` changes.** Stories 1.1/1.2 built all the backend this needs (Cognito pool, session handling, Account model); Amplify's `signIn` + the existing `getCurrentUser`/`Hub` wiring in `App.jsx` already carry the session mechanics. The work is one new screen, a small shared-component extraction, and an unauthenticated-surface toggle.

## Acceptance Criteria

1. **Given** an Account holder with valid credentials, **when** they log in, **then** they land on their authenticated home with a valid session. *(Epics says "authenticated home (Context Entry)" — Context Entry is Story 3.1 and doesn't exist; the authenticated home is currently the AccountBar + SpreadSelector stand-in established in 1.1/1.2. Landing there satisfies this AC.)*
2. **Given** an Account holder enters an incorrect password, **when** they attempt to log in, **then** they see a clear error and are not authenticated.
3. **Given** an authenticated Account holder's session is still valid, **when** they navigate directly to an authenticated URL later, **then** they aren't prompted to log in again until the session expires. *(No router exists — this app has one URL. The behavioral translation: a page reload while the Cognito session is valid restores the authenticated view without any login prompt. `App.jsx`'s `getCurrentUser`-on-mount already provides this; the AC is satisfied by not breaking it and verifying it live.)*

[Source: epics.md#Story-1.3]

## Copy (exact strings — single source of truth for this story)

| Trigger | Exact string |
|---|---|
| LogIn heading (`h1`) | `Log in` |
| LogIn subtext | `Welcome back to Systems Thinking Tarot.` |
| `NotAuthorizedException` OR `UserNotFoundException` | `Incorrect email or password.` |
| `LimitExceededException` / `TooManyRequestsException` | `Too many attempts — wait a moment and try again.` |
| `isSignedIn: false` + `nextStep.signInStep: 'CONFIRM_SIGN_UP'` | `That account was never finished being set up, so it can't be logged into. Ask the person who gave you your invite key — or Tony — for help.` |
| Any other unhandled failure / unrecognized `signInStep` | `Couldn't sign in. Please try again.` |
| SignUp → LogIn link | `Already have an account? Log in` |
| LogIn → SignUp link | `Have an invite key? Create your account` |

The two error-message rows for bad password and unknown user are **deliberately identical** — login must never confirm whether an email has an account (existence-leak rule from 1.1's review).

The `CONFIRM_SIGN_UP` copy deliberately does **not** tell the user to sign up again: the only users who can reach this state have a still-existing unconfirmed Cognito user, so an immediate re-signup with the same email throws `UsernameExistsException` ("An account already exists for that email.") until Cognito's unconfirmed-user expiry lapses — a dead loop between the two screens. This lingering-unconfirmed-user state is a known, accepted 1.1 leftover ("Noted, not fixed" in that story); do not attempt to fix it ad hoc in this story — the copy just has to be honest about the recovery path (a human).

## Tasks / Subtasks

- [x] **Task 1: Extract the shared `Field` component** (AC: 1, 2 — prerequisite refactor)
  - [x] `SignUp.jsx` has an unexported `Field` helper (label + input, exact dark-token classes, focus ring, `id` derived from label). It now has two consumers → extract to `src/components/Field.jsx` (default export, PascalCase, flat), **byte-identical classes and behavior**, and update `SignUp.jsx` to import it.
  - [x] No visual change anywhere. All existing SignUp tests must pass untouched (they query by label, not internals).
- [x] **Task 2: Build `src/components/LogIn.jsx`** (AC: 1, 2)
  - [x] Plain custom form (email + password `Field`s) calling `signIn` from `aws-amplify/auth` — mirror `SignUp.jsx`'s structure: DI props (`signInFn = signIn`, `onSignedIn = () => {}`), `useState` fields, `busy` + `useRef` double-submit guard, `role="alert"` error line, same card/container/button classes (`bg-gray-950` page, `bg-gray-900` card, `border-gray-700`, indigo primary button, visible focus rings, labels on every input — the AC7 baseline from 1.1). Heading + subtext per the Copy table.
  - [x] **`autoComplete` differs from SignUp — do not blind-mirror:** email field → `autoComplete="email"`, password field → `autoComplete="current-password"` (SignUp uses `new-password`; copying that here breaks password-manager autofill on the one screen where autofill matters most). The extracted `Field` already takes the prop.
  - [x] Trim the email before calling `signIn` (`email.trim()`) — a trailing mobile-autocorrect space plus the deliberately vague error copy is a real lockout.
  - [x] On `signIn` resolving: call `onSignedIn()` **only if `result.isSignedIn === true`** (1.1's hard rule: never fake an authenticated state). If `isSignedIn` is false, map `result.nextStep.signInStep` per the Copy table: `'CONFIRM_SIGN_UP'` → the never-finished-setup copy; anything else — MFA variants (none configured) and `'RESET_PASSWORD'` (reachable via an admin-forced reset; the fallback intentionally covers it, it is not dead code) → the generic fallback copy.
  - [x] Error mapping (follow `SignUp.jsx`'s `AUTH_ERROR_MESSAGES` map-with-fallback pattern, local to this file), per the Copy table. Special case: `UserAlreadyAuthenticatedException` → shouldn't be reachable (App gates on auth state), but if hit, call `onSignedIn()` — a live session IS the success condition.
  - [x] Voice/tone: plain and specific (EXPERIENCE.md); **no Ornamental Divider** (exclusive to the two LLM-touching screens); no "forgot password" link — password reset is in no story and out of v1 scope; do not scaffold it.
- [x] **Task 3: Wire the unauthenticated toggle in `App.jsx`** (AC: 1)
  - [x] The unauthenticated branch currently renders `<SignUp>` only. Add a local screen state (e.g. `const [authScreen, setAuthScreen] = useState('signup')`) rendering `SignUp` or `LogIn`. Default stays `'signup'` (current behavior; Story 2.1's Public Landing later becomes the real front door with distinct "I have an Invite Key" / "Log In" entries — this toggle is the interim path between the two screens).
  - [x] Cross-links per the Copy table, rendered as quiet text-button affordances (match the "Back — I need to fix my email" treatment in `SignUp.jsx`). Pass the switch handlers as props (prop-drilling per convention — no context, no router).
  - [x] **SignUp's link renders only on the initial-fields step, not during the confirmation-code step** — switching screens mid-confirmation would strand an in-flight redemption. Disable both links while `busy`, same as the existing back affordance (`SignUp.jsx`'s back button).
  - [x] `LogIn`'s `onSignedIn` → `setAuthState('authenticated')`, same as SignUp's `onConfirmed`. (The `Hub.listen('auth')` in `App.jsx` will also fire on `signedIn` — benign race, both set the same state; keep the explicit callback for determinism and testability.)
  - [x] **Preserve untouched:** the authenticated branch (AccountBar + SpreadView/SpreadSelector and every handler), the `loading` gate, and `AccountBar`'s retry states — `App.test.jsx` pins some of this and must keep passing.
- [x] **Task 4: Tests** (AC: all)
  - [x] `src/components/LogIn.test.jsx` (mirror `SignUp.test.jsx`'s style — DI mocks, label queries, `findByText` for async): valid credentials → `signInFn` called with `{ username, password }` (trimmed email), `onSignedIn` fired (AC 1); `NotAuthorizedException` rejection → "Incorrect email or password." visible, `onSignedIn` NOT called (AC 2); `UserNotFoundException` → identical copy (existence-leak pin); `isSignedIn: false` + `CONFIRM_SIGN_UP` nextStep → its copy shown, no `onSignedIn`; `UserAlreadyAuthenticatedException` rejection → `onSignedIn` IS called; `LimitExceededException` → its copy; double-click fires exactly one `signInFn` call.
  - [x] App-level toggle test — **component-level link-callback tests do not satisfy this** (they never prove App actually switches screens). Render `<App />` with `aws-amplify/auth` mocked (`getCurrentUser` rejecting → unauthenticated) and `aws-amplify/utils` mocked (`Hub.listen` returning a no-op unsubscribe): SignUp renders by default → click "Already have an account? Log in" → LogIn renders → click "Have an invite key? Create your account" → SignUp again. (`App.test.jsx` currently only tests the exported `AccountBar` and mocks only `./utils/account` — this is a new test block, not a modification of those.)
  - [x] Full suite green: all 32 existing tests + new ones; `npm run lint`, `npm run typecheck`, `npm run build` all pass.
- [x] **Task 5: Live sandbox verification** (AC: 1, 2, 3)
  - [x] No backend deploy needed (nothing under `amplify/` changes) — `npm run dev` against the existing `tonyreynolds` sandbox.
  - [x] In an incognito window (no stored session — Log Out is Story 1.4, so a normal window may still hold Tony's session): land on SignUp → toggle to Log In → wrong password first (see "Incorrect email or password.", stay unauthenticated — AC 2) → then correct credentials for Tony's real account → land on the authenticated home with the AccountBar showing the already-granted key state (AC 1).
  - [x] **Live-error expectations:** Cognito's default "prevent user existence errors" behavior means a nonexistent email also surfaces as `NotAuthorizedException` (the `UserNotFoundException` map entry is a defensive pin the live path won't normally produce), and repeated wrong passwords surface as `NotAuthorizedException` with "Password attempts exceeded" text rather than `LimitExceededException`. Same user-visible copy either way — don't chase a phantom mismatch.
  - [x] Reload the page in that same window: authenticated view restores with no login prompt (AC 3).

### Review Findings

- [x] [Review][Patch] Guard non-Error authentication rejections so the generic fallback message still renders [src/components/LogIn.jsx:43]

## Dev Notes

### What already exists — do not rebuild any of this

- **Session restore (AC 3) is already implemented** in `App.jsx:16-28`: `getCurrentUser()` on mount + `Hub.listen('auth', refreshAuth)`. Amplify v6 persists Cognito tokens in localStorage and refreshes them via the refresh token automatically. This story adds nothing to it — only verifies it and avoids breaking it.
- **`signIn` is already imported and used** in `SignUp.jsx` (post-confirmation explicit sign-in — chosen in 1.1 because Cognito's auto-sign-in needs the `USER_AUTH` flow the default app client doesn't enable). Same import, same call shape: `signIn({ username: email, password })`.
- **The app client's enabled auth flows are `USER_SRP_AUTH`/`CUSTOM_AUTH`/`REFRESH_TOKEN`** (verified live in 1.1). Plain `signIn` uses SRP by default — works as-is. Don't pass an `authFlowType`.
- **Error-map-with-fallback, busy+ref double-submit guard, `role="alert"` errors, DI-props test seam** — all established in `SignUp.jsx`; copy the patterns, not the file.
- **`AccountBar`/`GrantInviteKey`** (1.2) render the authenticated home's account area, including `role="status"` async announcements — the login screen should meet the same a11y bar (alert on error, labels, focus-visible).

### Current file states (read before touching)

- `src/App.jsx`: `authState` gate (`loading` → blank main; `unauthenticated` → `<SignUp onConfirmed=…>`; `authenticated` → `<AccountBar />` + spread flow). `AccountBar` is exported from this same file and has its own tests (`App.test.jsx`) covering loading/missing/error/retry states — those tests mock `./utils/account` and must keep passing unmodified.
- `src/components/SignUp.jsx`: holds the `Field` helper this story extracts, the error-map pattern, the back-affordance text-button treatment to reuse for the toggle links, and the `signIn` usage to mirror. Its confirmation-code step (`needsConfirmation` state) is where the toggle link must NOT render.
- `src/utils/account.js` / `src/utils/inviteKeys.js`: untouched by this story (the AccountBar already fetches the account on the authenticated side).

### Constraints & scope guards

- **Zero backend changes.** No `amplify/` edits, no new mutations, no data-schema changes, no WAF/IAM changes. If an implementation idea requires touching `amplify/`, it's the wrong idea for this story.
- **No router.** The epics AC's "authenticated URL" language predates the no-router reality (AD-1/project-context: conditional rendering only; a router is deliberately deferred to whichever Epic 2/3 story first needs it). Reload-persistence is the honest equivalent behavior.
- **No password reset / forgot-password** — in no story, out of v1 scope entirely. No link, no dead button.
- **No Log Out** — that's Story 1.4, which will land in the AccountBar area. Don't build it early, but don't make the toggle/screens assume it can't exist.
- **Frontend conventions bind:** plain JSX (no TS in `src/`), default exports for components, named exports for utils, `useState`/`useRef`/`useEffect` only, prop-drilling, exact dark tokens, Tailwind utility classes inline (no CSS files).
- **Existence-leak rule:** login errors never reveal whether an email is registered. One shared message for bad-password and no-such-user (see Copy table).

### Previous story intelligence (1.2, external dev agent)

- Final state: 32 tests passing, five code-review passes applied, live-verified (mint `W32D-UVPH-2QBY`, Tony's account now `onwardKeyGenerated: true` in the sandbox — so the AccountBar shows the already-granted state during this story's live verification; that's expected, not a bug).
- 1.2's reviews repeatedly hardened: retry/loading-state overlap, accessible async announcements (`role="status"`/`role="alert"`), clipboard isolation in tests, awaiting settled UI states in async tests. Write the new tests to that bar from the start — `waitFor` to settled states, no assertions mid-transition.
- 1.2 also back-filled Amplify model timestamps (`createdAt`/`updatedAt`) onto post-confirmation Account writes after the Data client's list() silently required them — a reminder that the generated client is strict about model shape; irrelevant to this story's code but explains the `handler.ts` timestamp lines if the dev agent reads them.
- Stories 1.1 and 1.2 are committed (`4812433`, `39476e5`); this story's `baseline_commit` is the full SHA of the dev-start HEAD, so the story diff is exactly this story's work.

### References

- [Source: epics.md#Story-1.3] — story + ACs
- [Source: EXPERIENCE.md#Information-Architecture] — "Log In: reached from Public Landing … standard Cognito email/password sign-in, no new visual pattern beyond the existing Input component"; spine-only, no mock
- [Source: EXPERIENCE.md#State-Patterns] — Sign Up success → straight to authenticated home (login mirrors this: no welcome interstitial)
- [Source: DESIGN.md#components.input, #Colors] — input treatment, dark tokens; no Ornamental Divider outside the two LLM screens
- [Source: ARCHITECTURE-SPINE.md#AD-1] — frontend stack frozen; no router
- [Source: _bmad-output/implementation-artifacts/1-1-redeem-an-invite-key-to-create-an-account.md#Review-Findings] — explicit-signIn-over-autoSignIn rationale, app-client auth flows, existence-leak concern, never-fake-auth rule, the accepted lingering-unconfirmed-user leftover behind the CONFIRM_SIGN_UP copy
- [Source: _bmad-output/implementation-artifacts/1-2-grant-one-invite-key-onward-first-gen-only.md#Dev-Agent-Record] — current test count/patterns, a11y bar, AccountBar behavior
- [Source: project-context.md] — component/util conventions, helper-extraction rule

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Extract the shared dark-token Field without changing SignUp behavior.
- Add a custom Cognito LogIn form with explicit success gating and existence-safe error mapping.
- Add the interim unauthenticated SignUp/LogIn toggle while leaving authenticated flows untouched.
- Cover component behavior and the App-level toggle, then verify session behavior in the live sandbox.

### Debug Log References

- 2026-07-12: Red phase confirmed LogIn was missing and App exposed no login toggle.
- 2026-07-12: Green phase passed all targeted LogIn, App-toggle, and unchanged SignUp tests.
- 2026-07-12: Full regression suite passed 41/41; typecheck, lint, and production build passed.
- 2026-07-12: Tony live-verified the SignUp/LogIn toggle, incorrect-password handling, successful login, and authenticated session restoration after reload.
- 2026-07-12: Code review patch guarded non-Error sign-in rejections; final suite passed 42/42 with typecheck, lint, and build green.

### Completion Notes List

- Extracted reusable Field with byte-identical input behavior/classes.
- Added custom LogIn with trimmed email, correct autocomplete, double-submit protection, exact error copy, and real-session-only success.
- Added SignUp/LogIn cross-links and App-level unauthenticated screen switching.
- Added eight LogIn tests and one App-level toggle test; all 41 tests pass.
- Live sandbox verification passed all four checks, covering AC 1–3.
- Resolved the sole code-review finding with optional error-name access and regression coverage.

### File List

_bmad-output/implementation-artifacts/1-3-log-in-to-an-existing-account.md
_bmad-output/implementation-artifacts/sprint-status.yaml
src/App.jsx
src/AppAuth.test.jsx
src/components/Field.jsx
src/components/LogIn.jsx
src/components/LogIn.test.jsx
src/components/SignUp.jsx

## Change Log

- 2026-07-12: Implemented Story 1.3 login, authentication-screen switching, shared Field extraction, automated coverage, and live session verification; moved to review.
- 2026-07-12: Applied code-review error-guard patch and marked Story 1.3 done.
