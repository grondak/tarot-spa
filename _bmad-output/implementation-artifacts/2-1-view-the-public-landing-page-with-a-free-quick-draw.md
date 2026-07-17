# Story 2.1: View the public landing page with a free Quick Draw

Status: ready-for-dev
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


- [ ] **Task 7: Close out (Definition of Done — Epic 1 retro action item #4)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
  - [x] Sweep the diff and this story file for live credentials/keys/secrets before committing (no invite-key codes, no AWS identifiers beyond what's already public convention).
  - [ ] Commit and push to `main`. A story is not `done` until its work is committed, pushed, and swept — this is the tightened definition of done from the Epic 1 retrospective.

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
- Added 6 RTL tests (55 total passing) and one flake-resistant Chromium end-to-end smoke test.
- Verified unauthenticated root, draw/redraw/back/load-code, auth entry destinations, and responsive layout contracts through automated browser and component coverage. Real-account login was not exercised because no user credentials were available to the agent; the authenticated round-trip remains covered by App integration tests.

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
