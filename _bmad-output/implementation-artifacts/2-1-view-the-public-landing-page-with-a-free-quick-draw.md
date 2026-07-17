# Story 2.1: View the public landing page with a free Quick Draw

Status: done
baseline_commit: 9c6e8be5f7bfc73e27a9ebbe1e06f4ea93bbba3a

## Story

As a visitor without an account,
I want to see what tarot-spa is about and try drawing cards for free,
So that I can decide whether I want to ask for access.

## Acceptance Criteria

1. **Given** an unauthenticated visitor navigates to the root URL, **when** the page loads, **then** they see the PR-FAQ pitch content with no Session or Account functionality exposed
2. **Given** an unauthenticated visitor is on the landing page, **when** they select a Spread and draw, **then** they see their drawn card(s) with pattern/questions/examples — no login required, no LLM/backend call involved (UX-DR12)
3. **Given** an unauthenticated visitor has drawn cards, **when** they use "Draw Again", **then** a new draw is made instantly, same as the existing app's unchanged behavior
4. **Given** an unauthenticated visitor has a draw code, **when** they enter it under "load a draw", **then** the corresponding cards load — existing behavior, unchanged (AD-12)
5. **Given** an unauthenticated visitor on the landing page already holds an Invite Key, **when** they select "I have an Invite Key", **then** they're taken to Sign Up / Redeem (Story 1.1's screen)
6. **Given** an unauthenticated visitor on the landing page already has an Account, **when** they select "Log In", **then** they're taken to the login screen (Story 1.3's screen) — distinct from the redemption path

## Copy (exact strings — single source of truth for this story)

All pitch copy is quoted from the governing mockup (`mockups/public-landing.html`), which itself quotes prd.md §1 Vision and §2.1 JTBD. Use these strings byte-for-byte.

| Element | Copy |
|---|---|
| Hero title (`h1`, the screen's one `display` heading) | `Systems Thinking Tarot` |
| Hero lede | `Most bad decisions aren't made because people lack information — they're made because people are oriented incorrectly before they decide. Draw your own Cards, Current Events are sourced live, and an LLM applies a systems-thinking Lens to your own situation in one shot — producing an Orientation Guide: not advice, not a summary, a different way of seeing the decision in front of you.` |
| JTBD pill 1 label / body | `Functional` / `See it from a different angle — not another pro/con list you could've made yourself.` |
| JTBD pill 2 label / body | `Emotional` / `An "oh" moment — a reframe, not an opinion or a recommendation.` |
| JTBD pill 3 label / body | `Social` / `Something worth sharing afterward — a phrase, a line, a reframe you want to show someone else.` |
| Quick Draw section micro-label (`label-caps` treatment) | `Try It Now — No Account Needed` |
| Quick Draw section heading (`h2`) | `Quick Draw` |
| Quick Draw section subtext | `Structured randomization forcing novel combinations of systems patterns. Free, unlimited, no login.` |
| Auth entry — redemption path (primary button) | `I have an Invite Key` |
| Auth entry — login path (secondary/quiet button) | `Log In` |

The mockup also shows a Request Access form — that is **Story 2.2, do not build it in this story** (see Constraints).

## Tasks / Subtasks

- [x] **Task 1: Add an `embedded` prop to `SpreadSelector`** (AC: 2, 4 — prerequisite refactor)
  - [x] `src/components/SpreadSelector.jsx` currently renders a full-screen centered layout (`min-h-screen … justify-center`) with its own hero block (`h1` "Systems Thinking Tarot" + tagline). The landing page supplies its own hero (the PR-FAQ pitch), so embedding the selector verbatim would duplicate the title and fight the layout.
  - [x] Add one optional prop, `embedded = false`. Default (`false`) must render **byte-identical** output to today — the authenticated home and all existing tests depend on it. When `embedded` is true: skip the hero block entirely and swap the outer wrapper to a plain block container (no `min-h-screen`, no vertical centering; keep the horizontal sizing of the spread grid / load-a-draw rows). Spread buttons, the "or load a draw" form, and the `Unrecognized draw code.` error behavior are identical in both modes — same JSX, same classes, same handlers.
  - [x] Do NOT fork the component or copy its internals into the landing page. EXPERIENCE.md mandates the Spread Selector is "the existing component, reused verbatim" across every surface that offers Spread selection — the `embedded` prop is a layout adapter, not a second implementation.
- [x] **Task 2: Build `src/components/PublicLanding.jsx`** (AC: 1, 2, 3, 4, 5, 6)
  - [x] Default export, plain JSX, flat under `src/components/` (convention). Props with defaults following the established DI/callback seam pattern: `onShowSignUp = () => {}`, `onShowLogIn = () => {}`.
  - [x] **Own draw state locally**: `const [spreadKey, setSpreadKey] = useState(null)` + `const [cards, setCards] = useState([])`, with handlers mirroring `App.jsx`'s existing `handleSelect` / `handleDrawAgain` / `handleBack` / `handleLoadCode` exactly (same `SPREADS[key].positions.length` → `shuffleAndDraw(n)` shape, same `decodeDraw` null-check contract returning `false` for a bad code). Public draw state must NOT live in `App` — it dies with the component on unmount (login), which is exactly the isolation the 1.4 shared-device reset established for the reverse direction.
  - [x] **Two view states, mirroring the authenticated branch:** when `spreadKey` is null, render the landing (header + pitch + Quick Draw section); when set, render `<SpreadView spread={SPREADS[spreadKey]} cards={cards} drawCode={encodeDraw(spreadKey, cards)} onDrawAgain={…} onBack={…} />` full-screen — `SpreadView` is reused with **zero changes** (AC 2/3 "same as the existing app's unchanged behavior" — card display, position labels, inverted state, Draw Again, Back, draw-code chip + copy button all come free).
  - [x] **Landing layout** (dark tokens, matching the mockup's structure): outer `min-h-screen bg-gray-950 text-white`; a top header row with the two auth entries right-aligned — `I have an Invite Key` as the primary indigo button (`bg-indigo-600 hover:bg-indigo-500` per the established primary treatment), `Log In` as the quiet secondary (`bg-gray-800 … text-gray-300` — the AccountBar/Retry button treatment); centered hero (`h1` `text-4xl font-bold tracking-tight`, lede `text-gray-300 text-lg` constrained ~`max-w-2xl mx-auto`); the three JTBD pills as a `flex-wrap` row of small cards (`bg-gray-900 border border-gray-700 rounded-xl p-4`, label in `text-indigo-300 text-xs font-semibold uppercase tracking-wider`, body `text-gray-400 text-sm`); a quiet section rule (`border-t border-gray-800`); then the Quick Draw section — micro-label (`text-xs uppercase tracking-wider text-gray-400 font-semibold`), `h2` (`text-2xl font-bold`), subtext (`text-gray-400 text-sm`), and a container card (`bg-gray-900 border border-gray-800 rounded-2xl p-6`) holding `<SpreadSelector embedded onSelect={…} onLoadCode={…} />`.
  - [x] **NO ornamental divider** — DESIGN.md reserves ❦ exclusively for the two LLM-touching screens; the mockup's header comment calls out its deliberate absence here. Use plain rules only.
  - [x] **Nothing Account/Session-shaped renders here** (AC 1): no `AccountBar`, no `GrantInviteKey`, no `getMyAccount` import/call, no auth reads beyond what `App` already gates. Quick Draw is not a Session (per PRD Glossary) — no backend call of any kind on this screen.
  - [x] A11y floor: `h1` → `h2` heading order, every input labeled (comes with `SpreadSelector`), visible focus treatment on both auth-entry buttons (`focus-visible:ring-2 focus-visible:ring-indigo-500` per the established pattern).
  - [x] **Fix the public front door's browser tab** in `index.html`: change `<title>tarot-spa</title>` to `<title>Systems Thinking Tarot</title>`, and remove the stock Vite favicon line (`<link rel="icon" type="image/svg+xml" href="/vite.svg" />`). A real favicon is deliberately deferred (no design investment this release — and ❦ is off-limits per DESIGN.md's divider exclusivity); the resulting silent `/favicon.ico` 404 is accepted.
- [x] **Task 3: Wire the landing into `App.jsx` as the unauthenticated front door** (AC: 1, 5, 6)
  - [x] `authScreen` grows a third value: `'landing' | 'signup' | 'login'`, **initial state `'landing'`** (replacing `'signup'`). Unauthenticated branch: `'landing'` → `<PublicLanding onShowSignUp={() => setAuthScreen('signup')} onShowLogIn={() => setAuthScreen('login')} />`; `'signup'`/`'login'` → the existing `SignUp`/`LogIn` rendering, cross-link props unchanged.
  - [x] **Change `handleSignedOut`'s `setAuthScreen('login')` to `setAuthScreen('landing')`.** This is deliberate, not a drive-by: Story 1.4's epic AC reads "returned to the Public Landing page," and EXPERIENCE.md's IA row for Log Out says "End the session, return to Public Landing." Landing on Log In was 1.3/1.4's explicitly interim behavior from before this screen existed. Keep the rest of `handleSignedOut` (draw-state reset, `authRequestId` bump) untouched.
  - [x] **Preserve untouched:** the `loading` gate, the `authRequestId` sequencing ref (1.4's review added it to stop stale Hub results overwriting newer transitions — do not disturb), the authenticated branch (AccountBar + spread flow + all handlers), and the SignUp↔LogIn cross-links. No back-to-landing affordance on SignUp/LogIn in this story — not in any AC; browser reload gets you back; don't scaffold it.
- [x] **Task 4: Update the tests that pin the old front door** (AC: 1, 5, 6 — deliberate revisions, not regressions)
  - [x] `src/AppAuth.test.jsx` — two existing expectations legitimately change; revise them knowingly, with these exact new shapes:
    1. **Toggle test:** initial unauthenticated render now shows the landing, not SignUp. New flow: `<App />` → assert hero + `I have an Invite Key` + `Log In` visible → click `I have an Invite Key` → SignUp renders → the existing cross-links (`Already have an account? Log in` / `Have an invite key? Create your account`) still toggle SignUp↔LogIn exactly as before.
    2. **Logout round-trip test:** after Log Out, the destination is now the landing — `await` the hero and assert `expect(screen.queryByText('Your account')).not.toBeInTheDocument()`. Then re-login continues: click `Log In` → `await screen.findByRole('heading', { name: 'Log in' })` → submit the mocked credentials → authenticated home.
    3. ⚠️ **Heading collision trap:** the landing's `h1` and the authenticated `SpreadSelector`'s `h1` are BOTH `Systems Thinking Tarot`. Any assertion distinguishing landing from authenticated home must NOT rely on that heading — use `Your account` (present only when authenticated) and `I have an Invite Key` (present only on the landing) as the discriminators. The round-trip's final "fresh SpreadSelector, no leftover cards" assertion becomes: `Your account` visible AND `I have an Invite Key` absent AND a spread button (e.g. `{ name: /Single Card/ }`) visible AND no `Draw Again` button.
    4. The module-mock factory for `aws-amplify/auth` needs **no new entries** — this story adds no new auth imports. Don't touch it.
  - [x] `src/components/PublicLanding.test.jsx` (new, mirror the established RTL style — DI callbacks, label/role queries, `waitFor`/`findBy*` to settled states):
    - Pitch renders: hero title, lede text, all three JTBD pill labels (AC 1)
    - No account surface: `Your account` and `Grant Invite Key` absent (AC 1)
    - Click a spread button (query `{ name: /Single Card/ }` — accessible name concatenates label+description+count) → card(s) render with a position label and `Draw Again` visible (AC 2)
    - `Draw Again` → the SpreadView persists with cards and the chip still rendered (AC 3). **Keep this test deterministic:** do NOT assert the draw-code changed (a ~1% random collision would flake the always-on Vitest gate) and don't assert on random card names — draw-*newness* is proven by the E2E loop in Task 5, which handles the collision correctly
    - `← Back` → landing pitch visible again
    - Valid draw code via `load a draw` → cards render (build the code in-test with `encodeDraw` from `src/utils/deck` — don't hardcode a magic string) (AC 4)
    - Invalid code → `Unrecognized draw code.` visible (existing-behavior pin)
    - `I have an Invite Key` click → `onShowSignUp` called once; `Log In` click → `onShowLogIn` called once (AC 5, 6)
  - [x] Full suite green: all 49 existing tests (minus the two deliberate revisions above) + new ones; `npm run lint`, `npm run typecheck`, `npm run build` all pass.
- [x] **Task 5: Playwright E2E foothold** (Epic 1 retro action item #1 — lands with this story by design)
  - [x] `npm i -D @playwright/test` (latest 1.61.x, verified current 2026-07-16) and `npx playwright install chromium` — chromium only for the foothold; more browsers are a later decision, not this story's.
  - [x] `playwright.config.js` at repo root: `testDir: './e2e'`, one chromium project, `use: { baseURL: 'http://localhost:5173' }`, `webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true }`.
  - [x] ⚠️ **Vitest collection trap:** Vitest's default include pattern will pick up `e2e/*.spec.js` and fail on Playwright imports. Add to `vite.config.js`'s `test` block: `exclude: [...configDefaults.exclude, 'e2e/**']` (import `configDefaults` from `vitest/config`). Verify `npm test` still runs exactly the jsdom suites and nothing under `e2e/`.
  - [x] New script in `package.json`: `"test:e2e": "playwright test"`. Do NOT fold it into `npm test` — the dev server needs `amplify_outputs.json` (gitignored, sandbox-generated), so e2e runs are a local/sandbox-machine concern for now, not part of the always-on gate.
  - [x] `e2e/public-landing.spec.js` — one smoke spec, entirely unauthenticated (no Cognito interaction; `getCurrentUser` rejects with no stored session and `App` lands on the public branch):
    1. Goto `/` → hero title + `I have an Invite Key` + `Log In` visible; `Your account` not present
    2. Click the Single Card spread → a card image + `Draw Again` visible; read the draw-code chip text
    3. **Draw Again, flake-proofed:** polling alone can never change the code (no redraw happens without a click), and a single click has a real (~1%) chance of reproducing the identical code on small spreads. Use a bounded loop: click `Draw Again` up to 3 times, breaking as soon as the chip text differs from the original; then assert it differs. Residual flake is ~one-in-a-million — acceptable
    4. Reload `/`, enter the saved draw code under `load a draw`, submit → the same spread view renders (assert the chip shows the entered code)
    5. Click `← Back` (after a fresh draw) → landing pitch visible again
  - [x] Add `test-results/` and `playwright-report/` to `.gitignore`.
  - [x] This makes live UI verification an agent-runnable script — the whole point of the retro action item. Run it and make it pass before Task 6's manual pass.
- [x] **Task 6: Live sandbox verification** (AC: all)
  - [x] No backend deploy (nothing under `amplify/` changes) — `npm run dev` against the existing `tonyreynolds` sandbox, incognito window (no stored session).
  - [x] Root URL → landing with pitch, no account UI (AC 1). Quick Draw: pick each of a couple of Spreads, draw, Draw Again, Back, load a draw code (AC 2–4).
  - [x] `I have an Invite Key` → Story 1.1's SignUp screen; back via reload; `Log In` → Story 1.3's login (AC 5–6). Log in with Tony's real account → authenticated home unchanged (AccountBar with already-granted state — expected from 1.2's mint; that key is now `revoked`, also expected). Log Out → **lands on the public landing** (the 1.4 destination change), draw state cleared. Reload while logged out → landing again.
  - [x] Narrow-viewport eyeball: hero, pills row wrap, auth-entry header wrap, embedded selector grid — no clipping or horizontal scroll.

### Review Findings

- [x] [Review][Patch] Restore Tasks 1–6 deleted from the story audit trail [_bmad-output/implementation-artifacts/2-1-view-the-public-landing-page-with-a-free-quick-draw.md:40]
- [x] [Review][Patch] Reset `authScreen` to landing when a Hub refresh detects authentication loss [src/App.jsx:26]
- [x] [Review][Patch] Give the load-a-draw textbox a programmatic label [src/components/SpreadSelector.jsx:57]
- [x] [Review][Patch] Make the embedded selector wrapper plain instead of painting a nested gray-950 panel [src/components/SpreadSelector.jsx:17]
- [x] [Review][Patch] Clear authenticated draw state when Hub detects session loss [src/App.jsx:26]
- [x] [Review][Patch] Reconcile the checked real-account verification task with the completion note that it was not performed [_bmad-output/implementation-artifacts/2-1-view-the-public-landing-page-with-a-free-quick-draw.md:91]
- [x] [Review][Patch] Update the stale “55 total passing” completion evidence to 56 [_bmad-output/implementation-artifacts/2-1-view-the-public-landing-page-with-a-free-quick-draw.md:176]

- [x] **Task 7: Close out (Definition of Done — Epic 1 retro action item #4)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
  - [x] Sweep the diff and this story file for live credentials/keys/secrets before committing (no invite-key codes, no AWS identifiers beyond what's already public convention).
  - [x] Commit and push to `main`. A story is not `done` until its work is committed, pushed, and swept — this is the tightened definition of done from the Epic 1 retrospective.

## Dev Notes

### What already exists — do not rebuild any of this

- **The entire draw engine**: `SPREADS`, `shuffleAndDraw`, `encodeDraw`, `decodeDraw` in `src/utils/deck.js`; `SpreadSelector.jsx` (spread grid + load-a-draw + error), `SpreadView.jsx` (cards grid, position labels, Draw Again/Back, draw-code chip with copy button), `CardDisplay.jsx` (pattern/questions/examples, inverted amber treatment). AC 2–4 are satisfied almost entirely by composition — the only new rendering is the pitch content and the section framing.
- **The auth state machine** in `App.jsx`: `authState` (`loading`/`unauthenticated`/`authenticated`) with `authRequestId` sequencing, `authScreen` toggle, `Hub.listen` refresh. This story adds one screen value and changes one transition target; nothing else.
- **SignUp/LogIn screens** (Stories 1.1/1.3) with their cross-links — reached from the landing's two entries; internally untouched.
- **Draw-code sharing** is client-only by architecture (AD-12) — the landing's Quick Draw involves zero network calls; don't add any.

### Constraints & scope guards

- **Zero backend changes.** No `amplify/` edits, no schema/mutation/WAF/IAM changes. If an idea needs `amplify/`, it's the wrong idea for this story.
- **Request Access form is Story 2.2.** The mockup shows it; this story does not build it, stub it, or reserve layout space beyond a natural section break. FR-5/SES/`request-access` Lambda all belong to 2.2. (Prep note for the human, not the dev agent: SES cutout-address verification is retro action item #2, due before 2.2 dev starts.)
- **No router.** Root-URL conditional rendering only, same as every prior story. The epics' "navigates to the root URL" is satisfied by the unauthenticated default render. A router remains deliberately deferred (AD-1 note in 1.3's spec still stands).
- **No Ornamental Divider** (❦ is exclusive to Context Entry / Orientation Guide Results — DESIGN.md, mockup header comment).
- **Frontend conventions bind:** plain JSX (no TS in `src/`), default exports for components, `useState`/`useRef`/`useEffect` only, prop-drilling, exact dark Tailwind tokens inline, minimal comments, flat `src/components/`.
- **Mockup illustrates; spine wins.** The mockup omits the two auth-entry buttons (AC 5/6 require them) and shows a collapsed non-interactive spread grid (the real component is interactive). EXPERIENCE.md + epics ACs govern.
- **Voice and tone:** plain, specific, no mystical flourish. All user-facing strings come from the Copy table — don't improvise alternates.

### Previous story intelligence (1.4, GPT-5 Codex dev agent)

- Final state: 49 tests green, lint/typecheck/build green, live-verified, committed as `c48eb85` + close-out `8861179`. Files this story touches were last shaped by 1.4: `App.jsx` (logout transition, `authRequestId` sequencing), `AppAuth.test.jsx` (module mocks + round-trip test), `App.test.jsx` (AccountBar suite — untouched by this story).
- 1.4's review specifically added: auth-refresh sequencing (don't disturb `authRequestId`), responsive wrapping on the AccountBar action cluster (the narrow-viewport eyeball standard now applies to the landing header too), and the App-level round-trip asserting real `signOut` invocation.
- Established test bar (1.2→1.4): `waitFor`/`findBy*` to settled states only, DI props over module mocks where a seam exists, label/role queries, App-level tests must prove App actually switches screens, no assertions mid-transition, reset mocks in `beforeEach`.
- Tony's sandbox account: `generation: FirstGen`, `onwardKeyGenerated: true`, and the minted key is now **`revoked`** (Epic 1 close-out) — the AccountBar shows the already-granted state during live verification; both expected, not bugs.
- Epic 1 retro (2026-07-16): this story carries two action items by design — the Playwright foothold (Task 5) and the tightened definition of done (Task 7). The retro's key insight: every serious Epic 1 bug was caught by adding a *new kind* of verification; Task 5 is the next kind.

### Project Structure Notes

- New: `src/components/PublicLanding.jsx` + `src/components/PublicLanding.test.jsx`; `playwright.config.js`; `e2e/public-landing.spec.js`.
- Updated: `src/App.jsx` (authScreen third value, default `'landing'`, logout destination), `src/components/SpreadSelector.jsx` (`embedded` prop, default-preserving), `src/AppAuth.test.jsx` (two deliberate expectation revisions), `vite.config.js` (Vitest `exclude` for `e2e/**`), `package.json` (+`@playwright/test` devDependency, +`test:e2e` script), `.gitignore` (+Playwright artifacts), `index.html` (tab title, Vite favicon removal).
- NOT touched: `amplify/**`, `SpreadView.jsx`, `CardDisplay.jsx`, `SignUp.jsx`, `LogIn.jsx`, `Field.jsx`, `GrantInviteKey.jsx`, `src/utils/**`, `src/App.test.jsx`.

### References

- [Source: epics.md#Story-2.1] — story + the six ACs; [Source: epics.md#Epic-2] — FR4/FR5 split across 2.1/2.2, AD-15 belongs to 2.2
- [Source: prd.md#1-Vision, #2.1-Jobs-To-Be-Done] — the PR-FAQ pitch source text; [Source: prd.md#FR-4] — "Nobody should be bereft of a good tarot reading if it's all done in their browser"; Quick Draw is not a Session
- [Source: EXPERIENCE.md#Information-Architecture] — Public Landing row (mock link), Sign Up / Log In / Log Out "return to Public Landing" reached-from entries
- [Source: EXPERIENCE.md#Component-Patterns] — Spread Selector "reused verbatim in all three places it appears"
- [Source: EXPERIENCE.md#Key-Flows] — the Priya flow this screen realizes (pitch → free Quick Draw → wants deeper access)
- [Source: mockups/public-landing.html] — governing layout + exact pitch copy; its header comment confirms no ornamental divider here
- [Source: DESIGN.md#Colors, #Typography, #Components] — dark tokens, `display`/`headline`/`label-caps` roles, button treatments; ❦ divider exclusivity
- [Source: ARCHITECTURE-SPINE.md#AD-1, #AD-2, #AD-12] — frontend stack frozen, base `/` already live, draw-code sharing stays client-only
- [Source: _bmad-output/implementation-artifacts/1-4-log-out.md] — auth machine current state, test bar, `authRequestId` rationale, logout's interim login destination
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-07-16.md] — action items #1 (Playwright) and #4 (definition of done) carried by this story
- Web-verified 2026-07-16: `@playwright/test` 1.61.1 current latest (npmjs.com); install browsers via `npx playwright install` (playwright.dev/docs/intro)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Adapt `SpreadSelector` for embedded composition while preserving its standalone default.
- Compose the public pitch and client-only draw flow from existing draw components and utilities.
- Extend the unauthenticated App state machine, then add RTL and Playwright coverage.
- Run all quality gates, live browser smoke verification, secret sweep, commit, and push.

### Debug Log References

- Playwright's Vite server could not bind to `::1:5173` inside the restricted command sandbox (`EPERM`); reran the browser gate with approved local-server access.
- In-app browser connection was unavailable because its runtime did not receive the required sandbox metadata; the required visitor flow was verified by the passing Chromium smoke spec instead.

### Completion Notes List

- Added the exact public PR-FAQ pitch, distinct Invite Key and Log In entries, and an isolated free Quick Draw flow with draw-code loading.
- Reused `SpreadSelector` and `SpreadView`; no backend or authenticated draw behavior changed.
- Updated logout to return to the public landing while preserving auth request sequencing and state resets.
- Added 7 RTL tests (56 total passing) and one flake-resistant Chromium end-to-end smoke test.
- Verified unauthenticated root, draw/redraw/back/load-code, auth entry destinations, and responsive layout contracts through automated browser and component coverage. Real-account login was not exercised because no user credentials were available to the agent; the authenticated round-trip remains covered by App integration tests.
- Committed and pushed the implementation to `main` as `6adfb9f`.
- Code review resolved all four findings: restored the story audit trail, covered Hub-driven auth loss, labeled the draw-code input, and removed the embedded background panel. All 56 tests and browser/quality gates pass.
- Second code review cleared draw state on Hub-detected session loss and corrected the verification record. Real-account sandbox verification remains open.
- Tony completed the real-account sandbox round trip on 2026-07-17. The initial account query showed `Account couldn’t load`; `Retry account` recovered to `You've already granted your key`, and login/logout/reload behavior verified successfully.

### File List

- .gitignore
- _bmad-output/implementation-artifacts/2-1-view-the-public-landing-page-with-a-free-quick-draw.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- e2e/public-landing.spec.js
- index.html
- package-lock.json
- package.json
- playwright.config.js
- src/App.jsx
- src/AppAuth.test.jsx
- src/components/PublicLanding.jsx
- src/components/PublicLanding.test.jsx
- src/components/SpreadSelector.jsx
- src/components/SpreadSelector.test.jsx
- vite.config.js

### Change Log

- 2026-07-16: Added the public landing and free Quick Draw, updated auth entry/logout routing, and established Playwright browser coverage.
- 2026-07-16: Resolved four code-review findings and marked the story done.
- 2026-07-17: Resolved three second-pass findings and returned the story to in-progress pending real-account sandbox verification.
- 2026-07-17: Completed real-account sandbox verification and returned the story to review.
- 2026-07-17: Final adversarial code review passed cleanly; marked the story done.
