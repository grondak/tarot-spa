---
baseline_commit: 39476e5
---

# Story 1.3: Log in to an existing Account

Status: ready-for-dev

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

## Tasks / Subtasks

- [ ] **Task 1: Extract the shared `Field` component** (AC: 1, 2 — prerequisite refactor)
  - [ ] `SignUp.jsx` has an unexported `Field` helper (label + input, exact dark-token classes, focus ring, `id` derived from label). Story 1.3 makes it two-consumer: extract it to `src/components/Field.jsx` (default export, PascalCase file, flat — project conventions) with **byte-identical classes and behavior**, and update `SignUp.jsx` to import it. project-context.md's "helpers stay unexported in the file that uses them" rule applies to single-consumer helpers; at two consumers, extraction is the right altitude (1.2's review rounds flagged duplication aggressively — don't hand them a copy-paste).
  - [ ] No visual change anywhere. All existing SignUp tests must pass untouched (they query by label, not internals).
- [ ] **Task 2: Build `src/components/LogIn.jsx`** (AC: 1, 2)
  - [ ] Plain custom form (email + password `Field`s) calling `signIn` from `aws-amplify/auth` — mirror `SignUp.jsx`'s structure exactly: DI props (`signInFn = signIn`, `onSignedIn = () => {}`), `useState` fields, `busy` + `useRef` double-submit guard, `role="alert"` error line, same card/container/button classes (`bg-gray-950` page, `bg-gray-900` card, `border-gray-700`, indigo primary button, visible focus rings, labels on every input — the AC7 baseline from 1.1).
  - [ ] On `signIn` resolving: call `onSignedIn()` **only if `result.isSignedIn === true`** (1.1's hard rule: never fake an authenticated state). If `isSignedIn` is false, map `result.nextStep.signInStep` to copy: `'CONFIRM_SIGN_UP'` → "That account was never confirmed — sign up again with your invite key to finish setting it up." (matches the redeem-flow reality: unconfirmed users were compensate-deleted or abandoned mid-confirmation); any other step (MFA variants — none are configured) → generic "Couldn't complete sign-in. Please try again."
  - [ ] Error mapping (follow `SignUp.jsx`'s `AUTH_ERROR_MESSAGES` map-with-fallback pattern, local to this file): `NotAuthorizedException` AND `UserNotFoundException` → the **same** copy, "Incorrect email or password." (deliberately identical — login must not confirm whether an email has an account; 1.1's review flagged account-existence leakage as a real concern). `LimitExceededException`/`TooManyRequestsException` → "Too many attempts — wait a moment and try again." `UserAlreadyAuthenticatedException` → shouldn't be reachable (App gates on auth state), but if hit, call `onSignedIn()` — a live session IS the success condition. Fallback: "Couldn't sign in. Please try again."
  - [ ] Voice/tone: plain and specific (EXPERIENCE.md); **no Ornamental Divider** (exclusive to the two LLM-touching screens); no "forgot password" link — password reset is in no story and out of v1 scope; do not scaffold it.
- [ ] **Task 3: Wire the unauthenticated toggle in `App.jsx`** (AC: 1)
  - [ ] The unauthenticated branch currently renders `<SignUp>` only. Add a local screen state (e.g. `const [authScreen, setAuthScreen] = useState('signup')`) rendering `SignUp` or `LogIn`. Default stays `'signup'` (current behavior; Story 2.1's Public Landing later becomes the real front door with distinct "I have an Invite Key" / "Log In" entries — this toggle is the interim path between the two screens).
  - [ ] Cross-links, rendered as quiet text-button affordances (match the "Back — I need to fix my email" treatment in `SignUp.jsx`): on SignUp, "Already have an account? Log in"; on LogIn, "Have an invite key? Create your account". Pass the switch handlers as props (prop-drilling per convention — no context, no router).
  - [ ] `LogIn`'s `onSignedIn` → `setAuthState('authenticated')`, same as SignUp's `onConfirmed`. (The `Hub.listen('auth')` in `App.jsx` will also fire on `signedIn` — benign race, both set the same state; keep the explicit callback for determinism and testability.)
  - [ ] **Preserve untouched:** the authenticated branch (AccountBar + SpreadView/SpreadSelector and every handler), the `loading` gate, and `AccountBar`'s retry states — `App.test.jsx` pins some of this and must keep passing.
- [ ] **Task 4: Tests** (AC: all)
  - [ ] `src/components/LogIn.test.jsx` (mirror `SignUp.test.jsx`'s style — DI mocks, label queries, `findByText` for async): valid credentials → `signInFn` called with `{ username, password }`, `onSignedIn` fired (AC 1); `NotAuthorizedException` rejection → "Incorrect email or password." visible, `onSignedIn` NOT called (AC 2); `UserNotFoundException` → identical copy (existence-leak pin); `isSignedIn: false` + `CONFIRM_SIGN_UP` nextStep → confirm-copy shown, no `onSignedIn`; double-click fires exactly one `signInFn` call.
  - [ ] App-level toggle coverage (extend `App.test.jsx` or component-level): SignUp → "Already have an account?" → LogIn renders; LogIn → invite-key link → SignUp renders.
  - [ ] Full suite green: all 32 existing tests + new ones; `npm run lint`, `npm run typecheck`, `npm run build` all pass.
- [ ] **Task 5: Live sandbox verification** (AC: 1, 2, 3)
  - [ ] No backend deploy needed (nothing under `amplify/` changes) — `npm run dev` against the existing `tonyreynolds` sandbox.
  - [ ] In an incognito window (no stored session — Log Out is Story 1.4, so a normal window may still hold Tony's session): land on SignUp → toggle to Log In → wrong password first (see the exact error copy, stay unauthenticated — AC 2) → then correct credentials for Tony's real account → land on the authenticated home with the AccountBar showing the already-granted key state (AC 1).
  - [ ] Reload the page in that same window: authenticated view restores with no login prompt (AC 3).

## Dev Notes

### What already exists — do not rebuild any of this

- **Session restore (AC 3) is already implemented** in `App.jsx:16-28`: `getCurrentUser()` on mount + `Hub.listen('auth', refreshAuth)`. Amplify v6 persists Cognito tokens in localStorage and refreshes them via the refresh token automatically. This story adds nothing to it — only verifies it and avoids breaking it.
- **`signIn` is already imported and used** in `SignUp.jsx` (post-confirmation explicit sign-in — chosen in 1.1 because Cognito's auto-sign-in needs the `USER_AUTH` flow the default app client doesn't enable). Same import, same call shape: `signIn({ username: email, password })`.
- **The app client's enabled auth flows are `USER_SRP_AUTH`/`CUSTOM_AUTH`/`REFRESH_TOKEN`** (verified live in 1.1). Plain `signIn` uses SRP by default — works as-is. Don't pass an `authFlowType`.
- **Error-map-with-fallback, busy+ref double-submit guard, `role="alert"` errors, DI-props test seam** — all established in `SignUp.jsx`; copy the patterns, not the file.
- **`AccountBar`/`GrantInviteKey`** (1.2) render the authenticated home's account area, including `role="status"` async announcements — the login screen should meet the same a11y bar (alert on error, labels, focus-visible).

### Current file states (read before touching)

- `src/App.jsx`: `authState` gate (`loading` → blank main; `unauthenticated` → `<SignUp onConfirmed=…>`; `authenticated` → `<AccountBar />` + spread flow). `AccountBar` is exported from this same file and has its own tests (`App.test.jsx`) covering loading/missing/error/retry states — those tests mock `./utils/account` and must keep passing unmodified.
- `src/components/SignUp.jsx`: holds the `Field` helper this story extracts, the error-map pattern, the back-affordance text-button treatment to reuse for the toggle links, and the `signIn` usage to mirror.
- `src/utils/account.js` / `src/utils/inviteKeys.js`: untouched by this story (the AccountBar already fetches the account on the authenticated side).

### Constraints & scope guards

- **Zero backend changes.** No `amplify/` edits, no new mutations, no data-schema changes, no WAF/IAM changes. If an implementation idea requires touching `amplify/`, it's the wrong idea for this story.
- **No router.** The epics AC's "authenticated URL" language predates the no-router reality (AD-1/project-context: conditional rendering only; a router is deliberately deferred to whichever Epic 2/3 story first needs it). Reload-persistence is the honest equivalent behavior.
- **No password reset / forgot-password** — in no story, out of v1 scope entirely. No link, no dead button.
- **No Log Out** — that's Story 1.4, which will land in the AccountBar area. Don't build it early, but don't make the toggle/screens assume it can't exist.
- **Frontend conventions bind:** plain JSX (no TS in `src/`), default exports for components, named exports for utils, `useState`/`useRef`/`useEffect` only, prop-drilling, exact dark tokens, Tailwind utility classes inline (no CSS files).
- **Existence-leak rule:** login errors never reveal whether an email is registered. One shared message for bad-password and no-such-user.

### Previous story intelligence (1.2, external dev agent)

- Final state: 32 tests passing, five code-review passes applied, live-verified (mint `W32D-UVPH-2QBY`, Tony's account now `onwardKeyGenerated: true` in the sandbox — so the AccountBar shows the already-granted state during this story's live verification; that's expected, not a bug).
- 1.2's reviews repeatedly hardened: retry/loading-state overlap, accessible async announcements (`role="status"`/`role="alert"`), clipboard isolation in tests, awaiting settled UI states in async tests. Write the new tests to that bar from the start — `waitFor` to settled states, no assertions mid-transition.
- 1.2 also back-filled Amplify model timestamps (`createdAt`/`updatedAt`) onto post-confirmation Account writes after the Data client's list() silently required them — a reminder that the generated client is strict about model shape; irrelevant to this story's code but explains the `handler.ts` timestamp lines if the dev agent reads them.
- Story 1.2 is committed as `39476e5` — this story's baseline. The working tree is clean at dev start; the story diff is exactly this story's work.

### References

- [Source: epics.md#Story-1.3] — story + ACs
- [Source: EXPERIENCE.md#Information-Architecture] — "Log In: reached from Public Landing … standard Cognito email/password sign-in, no new visual pattern beyond the existing Input component"; spine-only, no mock
- [Source: EXPERIENCE.md#State-Patterns] — Sign Up success → straight to authenticated home (login mirrors this: no welcome interstitial)
- [Source: DESIGN.md#components.input, #Colors] — input treatment, dark tokens; no Ornamental Divider outside the two LLM screens
- [Source: ARCHITECTURE-SPINE.md#AD-1] — frontend stack frozen; no router
- [Source: _bmad-output/implementation-artifacts/1-1-redeem-an-invite-key-to-create-an-account.md#Review-Findings] — explicit-signIn-over-autoSignIn rationale, app-client auth flows, existence-leak concern, never-fake-auth rule
- [Source: _bmad-output/implementation-artifacts/1-2-grant-one-invite-key-onward-first-gen-only.md#Dev-Agent-Record] — current test count/patterns, a11y bar, AccountBar behavior
- [Source: project-context.md] — component/util conventions, helper-extraction rule

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
