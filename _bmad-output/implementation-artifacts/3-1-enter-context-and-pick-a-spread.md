---
baseline_commit: 8c6f76c68e2dfa32fa8fa7f022dd0ea654f80f71
---

# Story 3.1: Enter Context and pick a Spread

Status: review

## Story

As an authenticated user with something to decide,
I want to describe my situation and pick a Spread,
So that I'm ready to get oriented.

## Acceptance Criteria

1. **Given** an authenticated user is on Context Entry, **when** the screen loads, **then** they see the contextual hint placeholder in the Context field and the four existing Spreads to choose from (UX-DR10)
2. **Given** the Context field is blank or whitespace-only, **when** the user attempts to submit, **then** submission is blocked inline and no request is sent (FR6)
3. **Given** Context has real text and a Spread is selected, **when** the user views "Help Me Orient", **then** it's active
4. **Given** the Context field is blank, **when** the user views "Help Me Orient", **then** it's inert
5. **Given** the Context Entry screen renders, **when** the user views the top and bottom of the screen, **then** the Ornamental Divider (❦ glyph + hairline rules) brackets both ends — the only screen besides Orientation Guide Results where it appears (UX-DR3)
6. **Given** Context Entry receives a flag indicating the Daily Orientation Limit is exhausted (computed elsewhere — Story 3.2 — and passed in; this story builds the presentational state only), **when** the screen renders with that flag set, **then** it shows Rate-Limited Intake instead — degrading to the free Quick Draw experience with a playful note, not a hard block (UX-DR13) — this is a Context Entry state, not a Results-screen concern

## Pre-dev prerequisites (Tony, before the dev agent starts)

One-time setup the agent cannot do; Task 6 (authenticated e2e) and Task 7 (live verification) stall without it:

1. **Dedicated agent test account** (Epic 2 retro action item #4): mint a fresh invite key, redeem it as a test account in the sandbox Cognito pool. Store the credentials **outside the repo** (password manager or a local untracked env file) and make them available to the agent's shell as `TAROT_E2E_EMAIL` / `TAROT_E2E_PASSWORD`. Success = the agent can log in with them at story start. Note: this story has **no** AD-6 counters and **no** LLM call, so this account burns nothing — the always-on authenticated smoke stays free until Story 3.2 lands; at that point authenticated *generation* e2e must become deliberate, not always-on (already agreed in the retro).
2. **Sandbox up to date**: no backend changes ship in this story, but e2e login needs the sandbox Cognito pool reachable and `amplify_outputs.json` present locally. If the sandbox was torn down, `npx ampx sandbox --once` before dev starts.

## Copy (exact strings — single source of truth for this story)

Canonical-state copy is from `mockups/context-entry.html` and EXPERIENCE.md's Voice and Tone table (UX-DR19: verbatim, no improvised alternates). Use byte-for-byte.

| Element | Copy |
|---|---|
| Screen title (`h1`, canonical state) | `Help Me Orient` |
| Screen subtitle | `Systems Thinking Tarot` |
| Context field label (`label-caps` treatment) | `Context` |
| Context placeholder (the FR6 hint — EXPERIENCE.md Voice and Tone "Do", verbatim; single hint, no per-Spread variation in v1) | `Tell me about your upcoming decision, and what you know or think you know about the situation.` |
| Spread group label (`label-caps` treatment) | `Spread` |
| Primary CTA | `Help Me Orient` |
| Quick Draw heading (`h1`, rate-limited + deliberate quick-draw states) | `Quick Draw` |
| Quick Draw subtitle | `Structured randomization forcing novel combinations of systems patterns.` |
| Rate-limit note (bold lead segment through "today", rest plain — mockup byte-exact) | `You're tapped out on Orientation Guides for today — but the cards themselves are always free and unlimited. Draw away, no LLM, no limit. Your Orient-o-meter refills tomorrow.` |
| Deliberate quick-draw entry (story-authored — see Dev Notes "Scope decision: the Quick Draw bridge") | `Draw for fun instead` |
| Return from deliberate quick draw (story-authored) | `Back to Help Me Orient` |

⚠️ **Accessible-name collision trap** (same class of trap 2.2 hit): `Help Me Orient` is the `h1`, the submit button, AND a substring of `Back to Help Me Orient`. In RTL use role-scoped queries; in Playwright, `getByRole('button', { name: 'Help Me Orient' })` matches by **substring** — always pass `exact: true` on this screen.

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight (Epic 2 retro action item #7)** (AC: none — gate)
  - [x] Verify baseline gates green before touching code: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
  - [x] Verify `amplify_outputs.json` exists (sandbox-generated, gitignored) and `TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD` are set in the shell.
  - [x] Prove the test account works **now**, not at Task 6: `npm run dev`, log in via the UI with the test credentials, confirm the authenticated surface loads ("Your account" bar). Expired/missing credentials surface here, at story start — not at the verification step.
- [x] **Task 1: `OrnamentalDivider` component** (AC: 5)
  - [x] `src/components/OrnamentalDivider.jsx` — default export, its own file (not a bottom-of-file helper) because Story 3.3 reuses it on Orientation Guide Results; those are the ONLY two screens that ever render it (UX-DR3).
  - [x] Markup: outer `div` with `aria-hidden="true"` (visual-only, no interaction — EXPERIENCE.md) and `flex items-center gap-3.5`; two flanking rules `h-px flex-1 bg-gray-700`; center glyph `<span className="text-lg leading-none text-gray-400">❦</span>` (U+2766).
  - [x] ⚠️ Token resolution: DESIGN.md's component spec wins over the mockup's CSS — glyph is `on-surface-muted` = **gray-400** at **18px** (`text-lg`), rules are `outline` = gray-700. (The mockup renders the glyph #6b7280/gray-500; gray-500 is not in the token set — spine wins on conflict.)
- [x] **Task 2: `SpreadSelector` additive props — do NOT fork the component** (AC: 1, 3, 6)
  - [x] Follow the 2.1 `embedded` precedent exactly: two new optional props whose **defaults leave every existing usage byte-identical** (PublicLanding, App's quick-draw path, all existing tests pass unmodified).
  - [x] `selectedKey` (default `undefined`): when provided (including `null`), the selector is in *selection mode* — each spread button gets `aria-pressed={key === selectedKey}`, and the button whose key matches gets the existing hover treatment applied persistently: `border-indigo-500 bg-gray-800` on the button, `text-indigo-300` on the name span (this matches the mockup's `.spread-option.selected` and introduces zero new styles — UX-DR4: no visual delta, the selected state IS the existing hover state made sticky). When `undefined`, render exactly today's markup (no `aria-pressed` attribute at all).
  - [x] `showLoadDraw` (default `true`): when `false`, omit the entire "or load a draw" block (divider row + form + error line). Canonical Context Entry has no draw-code loader (mockup section 1); the rate-limited/quick-draw state keeps it.
  - [x] `SpreadSelector.test.jsx`: ADD tests (existing two stay untouched): selection mode marks the selected option `aria-pressed=true` and others `false`; default usage has no `aria-pressed`; `showLoadDraw={false}` removes the Draw code textbox and Load button.
- [x] **Task 3: `ContextEntry` component** (AC: all)
  - [x] `src/components/ContextEntry.jsx` — default export, plain JSX, flat under `src/components/`. Props (the full contract — Stories 3.2/3.4 build on it, don't rename later):
    - `rateLimited = false` — Story 3.2 computes and passes the real flag; `true` forces the Rate-Limited Intake state (AC 6).
    - `initialContext = ''` — seeds the Context textarea (Story 3.4's "Tweak existing observation" pre-fill path; unused by App in 3.1).
    - `onOrient = () => {}` — called `onOrient(context.trim(), spreadKey)` on valid submit. Story 3.2 wires the real generation call; the default no-op is this story's intentional interim (see Dev Notes).
    - `onQuickDrawSelect` — App's existing `handleSelect` (draws cards, App renders `SpreadView`).
    - `onLoadCode` — App's existing `handleLoadCode`.
  - [x] State: `context` (`useState(initialContext)`), `spreadKey` (`useState(null)` — no default Spread; mockup's pre-selected Decision is illustrative), `mode` (`'orient' | 'quickdraw'`). Effective quick-draw rendering when `rateLimited || mode === 'quickdraw'`.
  - [x] **Canonical state** (orient mode), inside a column `mx-auto w-full max-w-2xl` on a `min-h-screen bg-gray-950 px-4 py-12 text-white` wrapper (AccountBar renders above it in App):
    - `<OrnamentalDivider />` at top, then `mt-12` gap to content (section-gap 48px brackets divider ↔ content, DESIGN.md).
    - Title block: `h1` `Help Me Orient` (`text-4xl font-bold tracking-tight` — display role, matches existing h1 treatment), subtitle `Systems Thinking Tarot` (`mt-2 text-sm text-gray-400`).
    - Context field: `<label htmlFor="context">` with label-caps classes (`text-xs font-semibold uppercase tracking-widest text-gray-400` — the AccountBar/PublicLanding micro-label treatment, per the mockup's `field-label`; NOT `Field.jsx`'s label style, and do NOT try to reuse `Field` — it hardcodes `<input>` + `required`). Textarea `id="context"`, reusing `Field`'s exact input class string plus `min-h-40 resize-y text-sm leading-relaxed placeholder:italic placeholder-gray-600`, `value={context}`, placeholder = hint copy from the Copy table. Freeform multi-paragraph plain text — no maxLength, no autoFocus.
    - Spread block: `<p>` `Spread` with the same label-caps classes (plain element, not `<label>` — it names a button group, not a form control), then `<SpreadSelector embedded selectedKey={spreadKey} showLoadDraw={false} onSelect={setSpreadKey} onLoadCode={() => false} />`. ⚠️ In orient mode `onSelect` only selects — it must NOT draw cards. Don't restyle the selector's internal `max-w-xl` grid (UX-DR4).
    - Form + CTA: wrap textarea/selector/CTA region's submit path in a `<form noValidate>`; CTA is `type="submit"`, copy `Help Me Orient`, centered row (`mt-8 flex justify-center`), primary treatment (SignUp/RequestAccess's exact primary-button string but `px-8 py-3`, no `w-full` — mockup's centered pill): `rounded-lg bg-indigo-600 px-8 py-3 font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-60`.
    - **Inert/active logic (AC 2, 3, 4):** `disabled={!context.trim() || !spreadKey}`. Belt-and-suspenders: the submit handler ALSO guards (`if (!context.trim() || !spreadKey) return;`) so a programmatic form submit can't slip through — blocked inline, no request, nothing sent (FR6). No validation error copy exists or is needed for this state — the disabled CTA is the spec'd treatment ("inert", EXPERIENCE.md).
    - Below the CTA row: the deliberate quick-draw entry — secondary text button `Draw for fun instead` (`mt-4` centered, secondary treatment: `rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`), `onClick={() => setMode('quickdraw')}`. See Dev Notes for why this is in scope.
    - `<OrnamentalDivider />` at bottom (`mt-12`). Exactly two dividers on this screen; zero anywhere else in the app (UX-DR3).
  - [x] **Quick-draw state** (rate-limited or deliberate) — replaces the WHOLE canonical layout (EXPERIENCE.md: the CTA and screen are replaced, not disabled in place). Same wrapper/column. No ornamental dividers here (mockup section 2 comment: degraded Quick Draw is not an LLM-touching screen). No Context textarea, no `Help Me Orient` button:
    - `h1` `Quick Draw` (`text-3xl font-bold tracking-tight` — mockup renders this title a step smaller than canonical), subtitle from Copy table (`mt-2 text-sm text-gray-400`).
    - **Only when `rateLimited`:** the playful note panel (`mt-6 rounded-lg border border-gray-700 bg-indigo-900/40 p-4 text-sm leading-relaxed text-gray-300`), copy byte-exact from the table with `<strong className="text-white">` around the lead segment ending at "today". This note is the ONLY thing distinguishing rate-limited from deliberate quick draw — one consistent experience (Story 3.7's AC 3 depends on exactly this).
    - `<SpreadSelector embedded onSelect={onQuickDrawSelect} onLoadCode={onLoadCode} />` (`mt-8`; loader present — default `showLoadDraw`, no `selectedKey`: byte-identical existing markup). Selecting a spread here DRAWS via App, exactly like the public landing.
    - **Only when NOT `rateLimited`** (deliberate mode): `Back to Help Me Orient` secondary button (`mt-8`, same secondary treatment), `onClick={() => setMode('orient')}` — Context and selected Spread state survive the round trip (component doesn't unmount). When `rateLimited`, there is no way back to the form — that's the point of the state (FR9 graceful degrade).
- [x] **Task 4: App integration** (AC: 1, 6)
  - [x] `src/App.jsx` authenticated branch: replace the bare `<SpreadSelector onSelect={handleSelect} onLoadCode={handleLoadCode} />` home with `<ContextEntry onQuickDrawSelect={handleSelect} onLoadCode={handleLoadCode} />`. The `spreadKey ? <SpreadView …> : …` branch stays exactly as-is — quick draws (from rate-limited or deliberate mode) flow through the existing `handleSelect` → `SpreadView` → `← Back` machinery unchanged. Do not pass `rateLimited` or `onOrient` (defaults; Story 3.2 wires both).
  - [x] Known acceptable quirk (document, don't fix): backing out of a quick-draw `SpreadView` remounts `ContextEntry` in orient mode (fresh state). Story 3.7 formalizes the navigation loop; don't build persistence for it now.
  - [x] `src/AppAuth.test.jsx` — the three authenticated tests currently treat the home as bare Quick Draw (they click `Single Card` and expect a drawn `SpreadView`). **Update them deliberately — never delete coverage** (2.1's record-integrity lesson): after `Your account` appears, assert the Context Entry `h1` (`getByRole('heading', { name: 'Help Me Orient' })`), then reach Quick Draw via `Draw for fun instead` before clicking `Single Card`. The assertions those tests make about sign-out clearing draw state, stale-refresh handling, and session-loss redirects all stay — only the path to a draw changes.
  - [x] Add one new AppAuth test: authenticated home shows Context Entry (heading + hint placeholder + inert CTA), and `Draw for fun instead` → `Single Card` → `SpreadView` renders (`Draw Again` visible) → `← Back` returns to Context Entry in orient mode.
- [x] **Task 5: `ContextEntry` unit tests** (AC: all)
  - [x] `src/components/ContextEntry.test.jsx` — new, established RTL style (DI props, role/label queries, settled-state assertions, `beforeEach` resets). ⚠️ Role-scope everything per the collision trap. Cover:
    - Canonical render: hint placeholder present on the labeled `Context` textarea (`getByLabelText('Context')` proves the a11y association, UX-DR17); all four spread names from `SPREADS` render (derive expectations from the `SPREADS` import — don't hardcode a parallel list); subtitle + `h1` present (AC 1).
    - CTA inert: blank Context → disabled; whitespace-only (`'   \n  '`) + spread selected → still disabled (AC 2, 4).
    - CTA inert with real text but NO spread selected → disabled (AC 3's contrapositive — both conditions required).
    - Real text + spread click → enabled; submit calls `onOrient` exactly once with `(trimmedContext, spreadKey)` (AC 2, 3).
    - `fireEvent.submit(form)` with whitespace Context → `onOrient` NOT called (the belt-and-suspenders guard).
    - Selected spread shows `aria-pressed=true` after click.
    - Exactly two `❦` glyphs in canonical state; both divider wrappers `aria-hidden` (AC 5). Zero `❦` in quick-draw/rate-limited states.
    - `rateLimited` render: note copy visible byte-exact; `Quick Draw` heading; NO Context textarea, NO `Help Me Orient` button, NO `Back to Help Me Orient`; Draw-code loader present; spread click calls `onQuickDrawSelect` (not selection) (AC 6).
    - Deliberate mode: `Draw for fun instead` → `Quick Draw` heading, NO note panel, `Back to Help Me Orient` present and returns to the form with typed Context intact.
    - `initialContext` prop pre-fills the textarea (Story 3.4's seam — pin it now).
  - [x] Full Vitest suite green, existing tests unmodified except the AppAuth updates named in Task 4.
- [x] **Task 6: Playwright authenticated fixture + smoke spec (Epic 2 retro action item #4, Amelia's half)** (AC: 1, 3, 4, 5)
  - [x] `playwright.config.js`: add a `setup` project (`testMatch: /auth\.setup\.js/`) and a `chromium-auth` project (`testMatch: /authenticated\.spec\.js/`, `storageState: 'playwright/.auth/user.json'`, `dependencies: ['setup']`, Desktop Chrome). Gate BOTH behind credentials so unauthenticated runs stay green on machines without them: spread-include the two projects only when `process.env.TAROT_E2E_EMAIL` is set. Existing `chromium` project must NOT pick up the new specs — scope it with `testIgnore` for the auth files (it must keep asserting the logged-out landing).
  - [x] `e2e/auth.setup.js`: log in through the real UI (goto `/`, `Log In`, fill `Email`/`Password` from `process.env.TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD`, wait for `Your account`), then `page.context().storageState({ path: 'playwright/.auth/user.json' })`. Amplify JS v6 keeps Cognito tokens in localStorage — `storageState` captures it.
  - [x] `.gitignore`: add `playwright/.auth/` (the state file contains live tokens — never committed).
  - [x] `e2e/authenticated.spec.js`: one smoke test, outcome-phrased (retro action item #8) — authenticated home shows the `Help Me Orient` heading, the hint placeholder, all four spreads, and a **disabled** CTA (`exact: true`!); fill Context + click `Decision` → CTA enabled (do NOT click it — nothing is wired until 3.2); two `❦` glyphs visible; `Draw for fun instead` → `Quick Draw` heading → `Single Card` → a card image and `Draw Again` render → `← Back` returns to Context Entry. No LLM, no counters, no spend — safe for the always-on gate.
- [x] **Task 7: Live verification (outcome-phrased)** (AC: 1, 3, 4, 5)
  - [x] No sandbox deploy needed (zero `amplify/` changes). `npm run dev`, log in as the test account: Context Entry IS the authenticated home — dividers bracket the screen, hint copy shows in the empty textarea, CTA visibly inert; typing + picking a Spread activates it; `Draw for fun instead` → real Quick Draw → draw renders cards → `← Back` returns.
  - [x] Rate-Limited Intake cannot be reached live (no real flag until 3.2) — its live evidence is the Vitest render tests; note that explicitly in the completion record rather than faking a live check.
  - [x] Narrow-viewport eyeball (~375px): single-column spread grid, textarea and dividers full-width, no horizontal scroll (UX-DR18).
  - [x] `npm run test:e2e` green with credentials set (all three projects), AND green with `TAROT_E2E_EMAIL` unset (public specs only — the no-creds path other machines will hit).
- [x] **Task 8: Close out (Definition of Done)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
  - [x] Sweep the diff and this story file for live credentials — ⚠️ this story's specific traps: the test account's email/password must never appear in code, config, tests, or this story file (env vars only), and `playwright/.auth/user.json` must be untracked before commit (`git status` proves it).
  - [x] Commit and push to `main`.

## Dev Notes

### What already exists — do not rebuild any of this

- **`SpreadSelector.jsx`** already has the `embedded` prop (2.1) and renders the four spreads derived from `SPREADS` plus the draw-code loader. This story only ADDS `selectedKey` + `showLoadDraw`. Its hover classes (`hover:bg-gray-800 hover:border-indigo-500`, `group-hover:text-indigo-300`) are the exact classes the selected state persists.
- **`App.jsx`'s authenticated draw machinery** (`handleSelect`/`handleDrawAgain`/`handleBack`/`handleLoadCode`, the `spreadKey ? SpreadView : …` branch, `AccountBar`) is the entire Quick Draw engine — ContextEntry plugs into it via two callbacks; it does not reimplement drawing, encoding, or `SpreadView`.
- **`PublicLanding.jsx`** shows the canonical embedded-SpreadSelector usage (panel + `handleSelect`/`handleLoadCode` wiring) — the rate-limited state's quick-draw section is the same wiring pattern, minus the panel chrome.
- **Button/primary/secondary treatments** are established byte-exact class strings (SignUp/RequestAccess primary; AccountBar's `Log Out`/`Retry account` secondary). Copy those strings; don't invent new ones.
- **The e2e harness** (chromium project, `webServer`, `reuseExistingServer`) exists — this story adds projects to it, it does not create a new harness.

### Scope decision: the Quick Draw bridge (`Draw for fun instead`)

Today's authenticated home IS Quick Draw. This story replaces the home with Context Entry, whose CTA does nothing until Story 3.2 wires generation, and whose Rate-Limited quick-draw state is unreachable until 3.2 passes the flag. Shipped without a bridge, authenticated users (real friends — commits to `main` auto-deploy to production) would lose the ability to draw cards at all: a regression of the app's core existing behavior. The story-creation guardrail applies: the system must keep working end-to-end, not just satisfy the listed ACs. The bridge is the minimal fix and is a deliberate forward-delivery of Story 3.7's first AC ("choose Quick Draw instead of Help Me Orient" + navigate back); 3.7 shrinks to verifying/formalizing this navigation plus its rate-limited-default AC. The two bridge strings are story-authored (no spec source exists) — flagged for Tony's review, not silently invented.

**Interim dead CTA, accepted:** between this story landing and 3.2, `Help Me Orient` activates on valid input but clicking it does nothing (`onOrient` no-op). Alternatives considered and rejected: disabling it violates AC 3; faking an error state lies to the user. Mitigation is the bridge (users always have a working path) plus sequencing 3.2 immediately next. Do not "fix" this by wiring anything — 3.2 owns the submit path.

### Constraints & scope guards

- **Frontend-only story.** Zero changes under `amplify/`, no new data models (AD-8), no network calls, no Session record, nothing consumed or persisted. If an idea needs a backend, it belongs to 3.2.
- **The rate-limit flag is a prop, period** (AC 6). No computing, guessing, or stubbing limit state from the client — NFR4 makes server-side enforcement 3.2's job; this story renders `rateLimited={true}` in tests only.
- **Ornamental Divider discipline** (UX-DR3): Context Entry top+bottom only (3.3 adds Results-bottom later). Never on Quick Draw states, PublicLanding, SignUp, dashboard. The quick-draw state of THIS screen gets none.
- **No new palette, dark-only, no toggle** (UX-DR1, UX-DR7). Every class in this story is an existing-token Tailwind class; `bg-indigo-900/40` (note panel) stays in the indigo-900 family the position-label treatment already uses.
- **Voice and Tone** (UX-DR19): the rate-limit note is playful by spec — resist "correcting" it into a formal limit message; equally, don't ad-lib extra jokes. Copy table is closed.
- **Frontend conventions bind** (AD-1, project-context.md): plain JSX, default-export components, `useState` only (no context/reducers/effects needed here), derive from `SPREADS` — never hardcode spread names/counts in components (tests derive expectations from the import), minimal comments, flat folders.
- **Quick Draw stays free-tier client-only** (AD-12): the bridge and rate-limited draws ride the existing `encodeDraw`/`decodeDraw` path untouched. No Session model involvement.
- **Mockup illustrates; spine wins** (EXPERIENCE.md): the mockup's pre-filled Erica context, pre-selected Decision spread, and gray-500 glyph are illustrative. Tokens and behavior come from DESIGN.md/EXPERIENCE.md; layout structure from the mockup.

### Previous story intelligence (2.2 + Epic 2 retro)

- 2.2 closed with **zero review findings** — the formula: reuse established byte-exact patterns, ⚠️ trap warnings in tasks, role-scoped queries, DI props over module mocks, settled-state assertions only. This story follows the same formula.
- Epic 2 retro process items are LIVE in this spec: #6 Pre-dev prerequisites section (above), #7 environment pre-flight (Task 0), #8 outcome-phrased verification (Tasks 6–7). The retro's test-count lesson also applies: don't hardcode suite counts as evidence — 71 Vitest tests at Epic 2 close, but commit `8c6f76c` (2.1 follow-up findings) post-dates that; Task 0 establishes the real baseline number.
- The `Account couldn't load` transient (retro investigate item #9, owner Amelia) is NOT this story's scope, but if it reproduces during live verification, capture the CloudWatch/AppSync evidence for that item instead of debugging inline.
- E2e runs need the sandbox-generated `amplify_outputs.json` — e2e remains a sandbox-machine concern, not CI.

### Architecture compliance checklist (the ADs that bind this story)

- **AD-1**: React 19.2 + Vite 7.3 + Tailwind v4 CSS-first, plain JSX in `src/` — no TypeScript, no new deps at all this story (Playwright/RTL/Vitest all present).
- **AD-2**: base path is already `/` — nothing to do, and nothing may reintroduce a subpath.
- **AD-12**: Quick Draw (all variants including rate-limited) stays client-only `encodeDraw`/`decodeDraw`; Orientation Guide Sessions (3.2+) never share its code path.
- **AD-6/AD-7/AD-13 awareness**: the daily-limit machinery this screen's `rateLimited` prop represents is atomic server-side reservation against Config — built in 3.2. Nothing in this story may pre-empt or partially implement it.
- **NFR4**: no client-side limit logic, even as a placeholder.

### Latest tech notes (web-verified 2026-07-18)

- Playwright's documented auth pattern is a dedicated **setup project** that logs in once and saves `storageState` (cookies + localStorage) to a JSON file consumed by dependent projects via `storageState`; keep the file under `playwright/.auth/` and gitignore it ([playwright.dev/docs/auth](https://playwright.dev/docs/auth)). Works with Cognito because Amplify v6 stores tokens in localStorage, which `storageState` serializes ([community write-up](https://dev.to/r0nunes/playwright-using-cognito-to-log-in-for-your-e2e-tests-3ap7)). Regenerate the state file when tokens expire — the setup project does this automatically each run.
- No other new technology enters the codebase in this story.

### Project Structure Notes

- New: `src/components/OrnamentalDivider.jsx`, `src/components/ContextEntry.jsx`, `src/components/ContextEntry.test.jsx`, `e2e/auth.setup.js`, `e2e/authenticated.spec.js`.
- Updated: `src/components/SpreadSelector.jsx` (+2 props), `src/components/SpreadSelector.test.jsx` (+3 tests), `src/App.jsx` (authenticated home swap), `src/AppAuth.test.jsx` (3 path updates + 1 new test), `playwright.config.js` (+2 gated projects), `.gitignore` (`playwright/.auth/`).
- NOT touched: `amplify/**`, `SpreadView.jsx`, `CardDisplay.jsx`, `PublicLanding.jsx`, `RequestAccess.jsx`, `SignUp.jsx`, `LogIn.jsx`, `GrantInviteKey.jsx`, `Field.jsx`, `src/utils/**`, `src/data/**`, `e2e/public-landing.spec.js`, `index.html`, `vite.config.js`, `package.json`.

### References

- [Source: epics.md#Story-3.1] — story + the six ACs; [#Epic-3] — FR6/FR7 binding, story-split rationale (3.1 presentational / 3.2 backend flag)
- [Source: prd.md#FR-6] — freeform multi-paragraph Context, hint placeholder (copy resolved by EXPERIENCE.md, single hint in v1); [#FR-7] — four existing Spreads unchanged; [#FR-9] — graceful degrade consequence the rate-limited state renders
- [Source: EXPERIENCE.md#Component-Patterns] — Context Textarea, Spread Selector (reused verbatim), "Help Me Orient" CTA (inert-while-blank, whole-screen replacement on limit), Ornamental Divider rows; [#State-Patterns] — "Daily Orientation Limit exhausted" and "Empty Context submitted" rows; [#Voice-and-Tone] — hint copy + rate-limit register; [#Accessibility-Floor]; [#Information-Architecture] — Context Entry = authenticated home, Quick Draw = "alternate entry"
- [Source: DESIGN.md#Components] — ornamental-divider token spec (glyph/rule colors, 18px), spread-selector tokens; [#Typography] — display/label-caps roles; [#Layout-&-Spacing] — section-gap bracketing rule
- [Source: mockups/context-entry.html] — canonical + Rate-Limited Intake layout, confirmed Candidate A divider, rate-limit note copy, no-loader canonical state, no-divider degraded state
- [Source: ARCHITECTURE-SPINE.md#AD-1/#AD-2/#AD-12] and [#AD-6/#AD-13] (boundary awareness only)
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-07-17.md] — action items #4 (test account + Playwright fixture, this story is "Epic 3's first authenticated surface"), #6/#7/#8 (process, applied here)
- [Source: _bmad-output/implementation-artifacts/2-2-request-access-via-the-form.md] — byte-exact primary-button string, trap-warning format, DoD close-out shape
- [Source: src/App.jsx, src/components/SpreadSelector.jsx, src/components/PublicLanding.jsx, src/AppAuth.test.jsx] — current-state behavior this story extends and must not regress
- Web-verified 2026-07-18: [Playwright auth/storageState](https://playwright.dev/docs/auth)

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Implementation Plan

Followed task order 0→8 as written. Red-green per task: SpreadSelector prop tests written and failing before the props; ContextEntry.test.jsx written against a missing module before the component. Selected-state styling implemented as whole-string class swaps so default usage renders byte-identical markup. ContextEntry renders one of two whole-screen states from the same mounted component (state survives orient ↔ quickdraw), matching the "replaced, not disabled in place" spec.

### Debug Log References

- **Deviation (1 line of scope):** spread buttons had no `type` attribute; inside ContextEntry's `<form>` they'd become submit buttons and clicking a second spread with real Context would fire `onOrient` spuriously. Fix: `type={selectionMode ? 'button' : undefined}` in SpreadSelector — default usage stays byte-identical (attribute absent), selection mode gets correct semantics. Pinned by a ContextEntry test ("does not submit when picking a different spread") and a type assertion in the selection-mode test.
- **Playwright storageState pitfall (cost ~1h, now documented):** the auth setup initially saved `storageState` immediately after `Your account` became visible — and captured an *empty* state, so the authenticated project saw the public landing. Root cause: Amplify v6 persists Cognito tokens to localStorage asynchronously, shortly *after* `signIn` resolves and the UI flips to authenticated (verified by network trace: RespondToAuthChallenge returns tokens, localStorage stays empty for ~1–2s, then 6 keys appear). Fix in `e2e/auth.setup.js`: `waitForFunction` for a `CognitoIdentityServiceProvider*` localStorage key before saving state.
- **Evidence for retro item #9 ("Account couldn't load" transient, owner Amelia):** during that same post-signIn gap, `getCurrentUser()` throws `UserUnAuthenticatedException` and `fetchAuthSession()` returns *guest identity-pool credentials* (no tokens). `AccountBar`'s `getMyAccount()` fires the moment the UI flips to authenticated, so it can race token persistence and fail transiently. Plausible mechanism, not yet confirmed against the 2026-07-17 CloudWatch logs — noted here for the retro item, not fixed in this story.
- ESLint flat config had no Node globals for Playwright files; added an `e2e/**` + `playwright.config.js` block (node + browser globals) — pre-existing gap surfaced by the first `process.env` usage in these files.

### Completion Notes List

- All 6 ACs implemented and tested. AC 6 (Rate-Limited Intake) is presentational-only per spec: `rateLimited` is a prop rendered in tests; it cannot be reached live until 3.2 passes the real flag — live evidence is the Vitest render tests, as the story directs.
- Vitest: 72 baseline → 89 (13 ContextEntry, +3 SpreadSelector, +1 AppAuth integration; 3 AppAuth paths updated to route through `Draw for fun instead`, zero assertions deleted).
- Playwright: 3 projects with credentials (setup + chromium + chromium-auth, 4 tests green), 1 project without (2 public tests green) — verified both ways.
- Live verification (test account, real login): Context Entry is the authenticated home; dividers bracket; hint shows; CTA inert→active on text+spread; bridge → Quick Draw → card renders → `← Back` returns. 375px: single-column grid, no horizontal scroll (programmatic check + screenshot eyeball).
- Known quirk documented per Task 4: backing out of a quick-draw SpreadView remounts ContextEntry in orient mode (fresh state); Story 3.7 owns the navigation loop.
- Bridge copy `Draw for fun instead` / `Back to Help Me Orient` is story-authored — flagged for Tony's review per Dev Notes.
- Credential sweep clean: 0 occurrences of test credentials in diff/untracked files; `playwright/.auth/` gitignored and confirmed ignored.

### File List

- `src/components/OrnamentalDivider.jsx` (new)
- `src/components/ContextEntry.jsx` (new)
- `src/components/ContextEntry.test.jsx` (new)
- `e2e/auth.setup.js` (new)
- `e2e/authenticated.spec.js` (new)
- `src/components/SpreadSelector.jsx` (modified — `selectedKey`/`showLoadDraw` props, selection-mode `type="button"`)
- `src/components/SpreadSelector.test.jsx` (modified — +3 tests)
- `src/App.jsx` (modified — authenticated home swap to ContextEntry)
- `src/AppAuth.test.jsx` (modified — 3 path updates + 1 new test)
- `playwright.config.js` (modified — setup/chromium-auth projects gated on credentials; chromium testIgnore)
- `eslint.config.js` (modified — Node+browser globals for e2e/ and playwright.config.js)
- `.gitignore` (modified — `playwright/.auth/`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — story status)
- `_bmad-output/implementation-artifacts/3-1-enter-context-and-pick-a-spread.md` (modified — this record)

## Change Log

- 2026-07-18: Story 3.1 implemented — Context Entry as authenticated home with OrnamentalDivider, SpreadSelector selection mode, quick-draw bridge, rate-limited presentational state; Playwright authenticated fixture (setup project + storageState) with token-persistence wait; 89 Vitest + 4 e2e green. Status → review.
