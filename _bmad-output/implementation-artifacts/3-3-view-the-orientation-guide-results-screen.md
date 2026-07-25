---
baseline_commit: 73d8d01
---

# Story 3.3: View the Orientation Guide Results screen

Status: done

## Story

As an authenticated user who just requested an Orientation Guide,
I want to see my drawn cards, the current events, and the essay clearly laid out,
So that I can actually read and absorb the reframing.

*(Frontend-only story — zero `amplify/` changes. Per 3.2's accepted Task 5 scope decision, this story also owns the entire client submit path: wiring `onOrient`, the in-flight and error states from EXPERIENCE.md's State Patterns, and the AppSync-timeout recovery that 3.2's live verification proved is the NORMAL path, not an edge case.)*

## Acceptance Criteria

1. **Given** the Orientation Guide is generated, **when** the Results screen renders, **then** it shows the drawn cards, the Current Events rundown, and the essay in `body-essay` typography at a constrained reading measure (UX-DR2, UX-DR11)
2. **Given** the Tavily call timed out and the Guide was generated without grounding (Story 3.2), **when** the Results screen renders, **then** it shows the playful "the news is slow today" note (AD-14)
3. **Given** the Orientation Guide Results screen renders, **when** the user scrolls to the bottom, past the essay, **then** the Ornamental Divider appears once, above the redraw actions — this screen does not get a top divider, only Context Entry gets both (UX-DR3)
4. **Given** a user highlights a phrase in the essay, **when** they use native browser copy, **then** it copies normally — no custom share UI exists (UX-DR16)

**Story-scope addendum** (inherited from 3.2's Task 5 scope decision — "the submit path moves to 3.3, which owns rendering the result and the in-flight/error states"; flagged for Tony there and accepted at 3.2's review):

5. **Given** valid Context + Spread, **when** the user taps "Help Me Orient", **then** the real `generateOrientationGuide` mutation fires exactly once, the loading treatment stays on the Context Entry screen with the expectation-setting copy, and duplicate submits are blocked while in flight
6. **Given** the mutation returns a frozen error code, **when** the client classifies it, **then**: `GENERATION_FAILED` → clear inline error on Context Entry, Context preserved, retry immediately available (no unit was consumed — AD-6 rollback); `MONTHLY_BUDGET_EXHAUSTED` → clear inline message (the global stop); `DAILY_LIMIT_EXHAUSTED` → the screen degrades to Rate-Limited Intake (UX-DR13), not an error banner
7. **Given** the mutation errors without a frozen code (the ~30s AppSync ceiling — the measured NORMAL case for a full generation), **when** the client recovers, **then** it polls the user's own Session records for a Session newer than the pre-submit baseline and, on finding one, renders Results from it — never re-submitting the paid mutation; if none appears by the deadline, the generic inline error shows

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. **Valid AWS session at story start** (SSO expiry was the 2.2 stall). No sandbox redeploy is needed — this story ships zero `amplify/` changes — but live verification drives real paid generations through the deployed sandbox.
2. **Real spend, small:** expect ~2–4 full generations during live verification (~$0.06–$0.15 at the $0.03 estimate each, plus limit-rejection tests which cost nothing). The AWS Budgets tripwire from the Epic 2 retro still covers this window.
3. **Sandbox state sanity:** 3.2 closed with Config `dailyLimit: 5` / `monthlyBudget: 30`, DailyUsage (test account, that UTC day) = 2, MonthlySpend = $0.06. The daily counter is per-UTC-day so it has likely reset; the agent reads actual values at Task 0. If MonthlySpend has drifted near the ceiling, say so.
4. `TAROT_E2E_EMAIL` / `TAROT_E2E_PASSWORD` available in the agent's shell (same env-only rule as 3.1/3.2 — never in repo files).

## Contract values (frozen — set by 3.2, this story consumes them)

These come from 3.2's "Contract values" table and its implemented handler — do not renegotiate any of them here.

| Item | Value |
|---|---|
| Mutation | `client.mutations.generateOrientationGuide({ context, spreadKey })` — `a.json()` return; **data may arrive as a JSON string — `JSON.parse` if `typeof data === 'string'`** (proven trap, `src/utils/orientation.js` pattern) |
| Success payload | `{ sessionId, cards: [{ name, position, inverted }], currentEvents: [{ title, content, url?, published_date? }] (0–3 items), guide: string, tavilyTimedOut: boolean }` — lean cards by design; rehydrate full card data from `FULL_DECK` by `name` |
| Error codes (in `errors[0].message`; match with `.includes()`, never `===` — AppSync may wrap) | `DAILY_LIMIT_EXHAUSTED`, `MONTHLY_BUDGET_EXHAUSTED`, `GENERATION_FAILED` |
| Measured end-to-end latency | **30.7s and 30.6s on both real generations** — AppSync's hard 30s ceiling fired while the Lambda kept running and persisted the Session. Client-side recovery is REQUIRED behavior, not defensive polish |
| Session model (owner-read via bare-`sub` identityClaim) | `{ id, spreadKey, context, cards (a.json), currentEvents (a.json), guide, tavilyTimedOut, createdAt, updatedAt }` — `a.json()` model fields get the same defensive string-parse treatment |
| Lambda ceiling | 60s (`timeoutSeconds: 60`) — recovery deadline derives from this, not from the 30s AppSync window |
| Recovery poll | every 5s until 75s after submit (60s Lambda cap + margin); baseline = newest own Session **before** submit, compared by server-side `createdAt`/`id` (client clock never enters the comparison) |
| Status query | `getOrientationStatus()` → `{ dailyUsed, dailyLimit, limitExhausted }` — already wired fail-open in `App.jsx`; re-fetch after any successful generation so the `rateLimited` flag is current when the user returns to Context Entry |

## Copy (exact strings — single source of truth for this story)

Spec-sourced strings are verbatim (UX-DR19). Story-authored strings had no spec source and are **flagged for Tony's review** — same protocol as 3.1's bridge copy.

| Element | Copy | Source |
|---|---|---|
| Loading treatment (on Context Entry, `role="status"`) | `Reading the cards and the world...` | EXPERIENCE.md State Patterns, verbatim (three periods) |
| Results screen title (`h1`) | `Your Orientation Guide` | mockup |
| Results subtitle | `{spread.label} · {spread.description}` derived from `SPREADS[spreadKey]` (e.g. `Decision · Current State · Path A · Path B · Integration`) — derive, never hardcode | mockup structure (minor delta from its "Decision Spread" phrasing — acceptable, mockups illustrate) |
| Cards section label (`h2`, label-caps) | `Your Draw` | mockup |
| Events section label (`h2`, label-caps) | `Current Events` | mockup |
| Essay section label (`h2`, label-caps) | `Your Orientation Guide` | mockup |
| Tavily-timeout note (AC 2) | `The news is slow today — this Guide worked from the cards and your own words alone.` | **story-authored** (AD-14's register: "the news is slow today, ha ha"; playful, not a dry error) |
| Generation-failed inline error | `Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.` | **story-authored** (EXPERIENCE.md: "clear inline error; does not consume a unit; retry without re-entering Context") |
| Monthly-ceiling inline error | `Everyone's shared monthly Guide budget is spent — Orientation Guides return when the month rolls over. Quick Draw is always free.` | **story-authored** (FR10/3.2 AC 6: "rejected with a clear message"; no spec copy exists) |
| Interim back action on Results | `← Back` | **story-authored interim** — existing app vocabulary (`SpreadView`); replaced by 3.4's two redraw actions (see Dev Notes scope decision) |

⚠️ **Accessible-name collision trap (this screen's version):** `Your Orientation Guide` is the `h1` AND the essay's `h2`. Role-scoped queries with `level` (`getByRole('heading', { name: 'Your Orientation Guide', level: 1 })`) or `exact: true` everywhere on this screen — the 3.1 lesson applies again.

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight (retro item, standing)** (AC: none — gate)
  - [x] Baseline gates green before touching code: `npm test` (127 at 3.2 close — establish the real number, don't hardcode it as evidence), `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e` with AND without `TAROT_E2E_EMAIL` set.
  - [x] AWS credentials valid; `amplify_outputs.json` present. **No sandbox deploy** — if the schema in the sandbox predates 3.2, stop and tell Tony; do not redeploy on your own initiative mid-story.
  - [x] Read live sandbox state (aws cli): Config `global` values, the test account's DailyUsage for today (UTC), MonthlySpend for this month. Record the numbers — Task 6 restores them.
  - [x] Log in via `npm run dev` with the test credentials — authenticated Context Entry loads.
- [x] **Task 1: `src/utils/orientation.js` — mutation + Session-recovery clients (thin, client-calls only)** (AC: 5, 7)
  - [x] `generateOrientationGuide(context, spreadKey)`: `generateClient()` → `client.mutations.generateOrientationGuide({ context, spreadKey })`; throw `new Error(errors[0].message)` on `errors` (the existing `getOrientationStatus` pattern, byte-for-byte style); parse string data. Returns the payload object.
  - [x] `getNewestSession()`: `client.models.Session.list()` looping `nextToken` until exhausted (DynamoDB scan pagination can return empty pages with a token — never stop on an empty page). Owner-read auth means only the caller's Sessions come back. Return the item with the max `createdAt` (or `null` if none), with `cards`/`currentEvents` passed through `typeof x === 'string' ? JSON.parse(x) : x`. Friend-scale table — no limit tuning needed.
  - [x] Keep BOTH functions free of orchestration/classification logic — that lives in `App.jsx` where `AppAuth.test.jsx` can drive it through the established module mock (this repo mocks `src/utils/orientation.js` wholesale; logic buried here would be untestable in the existing architecture).
- [x] **Task 2: `App.jsx` — `handleOrient` orchestration + Results state** (AC: 5, 6, 7)
  - [x] State: `guideResult` (`useState(null)`). Authenticated render priority: `guideResult ? <OrientationGuideResults …/> : spreadKey ? <SpreadView …/> : <ContextEntry …/>` — the Quick Draw machinery (`handleSelect`/`SpreadView`/`← Back`) stays byte-identical.
  - [x] `async function handleOrient(context, spreadKey)` passed as `onOrient={handleOrient}`; flow:
    1. Baseline: `const baseline = await getNewestSession().catch(() => null)` — fail-soft; a null baseline just means "any recovered Session counts as new".
    2. `const result = await generateOrientationGuide(context, spreadKey)` inside try/catch.
    3. **Success:** `setGuideResult({ spreadKey, context, ...payload-fields })` — spreadKey isn't in the mutation payload (App already has it) and `context` is stored for 3.4's "Tweak existing observation" seam. Then refresh the flag: `getOrientationStatus().then(s => setRateLimited(s?.limitExhausted === true)).catch(() => {})` — fail-open, so returning from Results lands on the correct Context Entry state.
    4. **Catch — classify by `error.message.includes(code)`:**
       - `DAILY_LIMIT_EXHAUSTED` → `setRateLimited(true)`; return normally (no throw). The whole screen degrades to Rate-Limited Intake — that IS the spec'd treatment (UX-DR13); typed Context is lost with the swap, accepted (whole-screen replacement per EXPERIENCE.md).
       - `MONTHLY_BUDGET_EXHAUSTED` → rethrow as-is; ContextEntry renders the monthly copy inline.
       - **Anything else** (AppSync ~30s timeout, network blip — no code present) → recovery, next bullet.
    5. **Recovery (AC 7):** poll `getNewestSession()` every 5s until 75s after the original submit. A recovered Session counts when `baseline === null ? true : (session.id !== baseline.id && session.createdAt > baseline.createdAt)` — server-clock vs server-clock, immune to client clock skew. Found → build the same result object from the Session record (`{ spreadKey: session.spreadKey, context: session.context, sessionId: session.id, cards, currentEvents, guide, tavilyTimedOut }`) → success path (step 3, including the status refresh). Not found by deadline → `throw new Error('GENERATION_FAILED')` (the counters were rolled back server-side or the request truly died; the generic error + preserved Context is correct either way).
       - ⚠️ **Recovery NEVER calls `generateOrientationGuide` again.** A retry after timeout double-spends real money and daily units — the first request is still running server-side. The only path to a second mutation is the user pressing the CTA again after a surfaced error.
  - [x] `handleSignedOut` additionally clears `guideResult` (Results must never survive into the next session — NFR1 hygiene, same list as `spreadKey`/`cards`).
  - [x] Interim back from Results: `onBack={() => setGuideResult(null)}` — returns to Context Entry fresh (blank). 3.4 replaces this with the two redraw actions.
- [x] **Task 3: `ContextEntry.jsx` — in-flight + error states (additive; nothing existing moves)** (AC: 5, 6)
  - [x] New local state: `busy` (`useState(false)`), `orientError` (`useState(null)` — holds a code string). `handleSubmit` becomes async: guard `if (busy) return;` ahead of the existing blank/spread guard; then `setOrientError(null); setBusy(true); try { await onOrient(context.trim(), spreadKey); } catch (error) { setOrientError(error?.message || 'GENERATION_FAILED'); } finally { setBusy(false); }` — store the raw message; the render branch does the `.includes()` matching. (On success App unmounts this component — a post-unmount `setBusy` is a React-18+ no-op, fine. `submittingRef`-style double-guard as in `AccountBar` if preferred; `busy` in the disabled prop already blocks the second click.)
  - [x] CTA while busy: `disabled={busy || !context.trim() || !spreadKey}`. Below the CTA row, only while busy: the loading line, `role="status"`, copy from the Copy table byte-exact, styled quiet (`mt-4 text-center text-sm text-gray-400`). Loading stays ON this screen — no interstitial, no spinner component, no progress bar (EXPERIENCE.md State Patterns; measured ~31s, the copy is the expectation-setter).
  - [x] Error rendering, only when `orientError` and not busy: inline `role="alert"` paragraph below the CTA row (`mt-4 text-center text-sm text-red-400` — `error` token, form-error precedent). Two texts: `orientError.includes('MONTHLY_BUDGET_EXHAUSTED')` → monthly copy; anything else → generation-failed copy. Context and selected Spread remain untouched — retry is one click (EXPERIENCE.md: "retry immediately without re-entering Context").
  - [x] `DAILY_LIMIT_EXHAUSTED` never renders here — App flips `rateLimited` and this component's existing Rate-Limited Intake branch takes over. Do not add a third error text for it.
  - [x] Do NOT restructure the existing form, quick-draw bridge, or Rate-Limited Intake markup — 3.1's tests must pass with zero assertion changes.
- [x] **Task 4: `OrientationGuideResults.jsx` — the screen** (AC: 1, 2, 3, 4)
  - [x] `src/components/OrientationGuideResults.jsx` — default export, plain JSX, flat under `src/components/`. Props: `result` (`{ spreadKey, cards, currentEvents, guide, tavilyTimedOut }` — `context`/`sessionId` present in the object but unused here), `onBack`.
  - [x] **Rehydrate cards** (3.2's payload contract): `result.cards.map(({ name, position, inverted }) => { const card = FULL_DECK.find(c => c.name === name); return card ? { card: { ...card, inverted }, position } : null; }).filter(Boolean)` — a name miss (shouldn't happen; server draws from the same deck module) drops the card rather than crashing. Import `FULL_DECK` from `../data/systemsTarot`.
  - [x] Layout, top to bottom (wrapper `min-h-screen bg-gray-950 px-4 py-12 text-white`; AccountBar renders above it in App; **no top divider** — AC 3):
    - Header: `h1` `Your Orientation Guide` (`text-2xl font-bold` — headline role, `SpreadView` h1 treatment), subtitle `mt-1 text-sm text-gray-400` derived per the Copy table. Wide column `mx-auto w-full max-w-6xl` for header + cards (the cards want width; `SpreadView` precedent).
    - `h2` `Your Draw` with label-caps classes (`text-xs font-semibold uppercase tracking-widest text-gray-400`), then the cards grid: `mt-4 grid gap-6` + `gridClass(cards.length)` **imported from `SpreadView`** — add `export` to the existing `gridClass` function in `SpreadView.jsx` (one-word change; do not copy the function, do not touch anything else in that file). Each cell: `<CardDisplay card={entry.card} position={entry.position} />` — the component is reused untouched; inverted amber/rotate treatment comes free (UX-DR6).
    - Current Events block (`mt-12` — section-gap): `h2` `Current Events` label-caps. If `tavilyTimedOut` → the playful note instead of a list, in the established note-panel treatment (`mt-4 rounded-lg border border-gray-700 bg-indigo-900/40 p-4 text-sm leading-relaxed text-gray-300` — the Rate-Limited note's exact classes; same "playful aside" family). Else if items exist → panel `mt-4 rounded-xl border border-gray-800 bg-gray-900 px-6 py-2` containing a `ul`; each `li` (`border-b border-gray-800 last:border-b-0 py-3 text-sm leading-relaxed`): item `title` in `text-gray-200 font-medium`, then `content` in `mt-1 text-gray-400`. Ignore `url`/`published_date` — the mockup shows no links or dates and the spine is silent; don't invent UI. Else (0 items, no timeout — degraded Tavily success) → omit the entire block including its `h2`.
    - Essay (`mt-12`): constrained column `mx-auto w-full max-w-2xl` (~65ch — UX-DR2's reading measure). `h2` `Your Orientation Guide` label-caps, then the essay: split `guide` on blank lines (`guide.split(/\n\s*\n/)`, filter empties; a no-break essay renders as one `<p>`), each paragraph `<p>` in **body-essay**: `text-lg leading-8 text-gray-200`, paragraphs spaced `mt-5 first:mt-0` (mockup's 20px). No headings, no numbering injected — the five-part structure lives inside the continuous prose (EXPERIENCE.md Component Patterns).
    - `<OrnamentalDivider />` (`mt-12`, inside the `max-w-2xl` column like the mockup) — the ONLY divider on this screen: bottom, above the actions (AC 3). App-wide invariant after this story: exactly 3 `❦` render across the app — 2 on Context Entry, 1 here.
    - Actions row (`mt-12 flex justify-center`): the interim `← Back` secondary button (byte-exact secondary treatment from `ContextEntry`: `rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`), `onClick={onBack}`. 3.4 replaces this row with "Provide another observation" / "Tweak existing observation".
  - [x] **Nothing to build for AC 4:** native selection/copy works unless you break it — add no share button, no copy affordance, no `user-select` CSS, no selection handlers (UX-DR16).
- [x] **Task 5: Tests** (AC: all)
  - [x] `src/components/OrientationGuideResults.test.jsx` — new, established RTL style (build a `result` fixture whose card names come from `FULL_DECK` imports, not invented names). Cover: rehydrated card renders `FULL_DECK` content (pattern text + position label visible — proves rehydration, not just name echo); inverted card in fixture gets the amber treatment via CardDisplay (query the pattern text's class or the `, Inverted.` name suffix); events list renders title + content per item; `tavilyTimedOut: true` → note copy byte-exact, no events list; zero events + no timeout → no `Current Events` heading at all; essay paragraphs split on blank lines with the body-essay classes on each `<p>`; exactly ONE `❦` glyph, wrapper `aria-hidden` (AC 3's "no top divider" pinned as glyph-count === 1); `← Back` click calls `onBack` once; heading queries role-scoped with `level` (the collision trap).
  - [x] `src/components/ContextEntry.test.jsx` — ADD (existing tests unmodified): pending `onOrient` (unresolved promise) → `role="status"` shows the loading copy byte-exact + CTA disabled; second submit while pending → `onOrient` called exactly once; reject `Error('GENERATION_FAILED')` → `role="alert"` with the generation-failed copy, textarea still holds the typed Context, spread still `aria-pressed`, CTA re-enabled; reject `Error('MONTHLY_BUDGET_EXHAUSTED')` → monthly copy; resubmit after error clears the alert.
  - [x] `src/AppAuth.test.jsx` — extend the existing `src/utils/orientation.js` mock with `generateOrientationGuide` + `getNewestSession` (defaults: resolve happy). ADD: (a) fill Context + pick spread + submit → mutation called once with `(trimmedContext, spreadKey)` → Results screen renders (essay text + `Your Draw` visible, Context Entry gone); (b) mutation rejects `DAILY_LIMIT_EXHAUSTED` → Rate-Limited Intake renders (Quick Draw heading + note, no alert); (c) mutation rejects with a timeout-ish message, `getNewestSession` returns baseline `null` then a Session → Results renders from the recovered Session AND `generateOrientationGuide` was called exactly once (the never-resubmit invariant, pinned); (d) recovery never finds a Session → generation-failed alert on Context Entry (use fake timers to fast-forward the poll loop — do not let this test really wait 75s); (e) after success, `getOrientationStatus` was re-fetched; (f) sign-out from Results clears back to landing (existing sign-out assertions pattern).
  - [x] Full suite green; 3.1's ContextEntry/AppAuth assertions unmodified.
- [x] **Task 6: Live verification (outcome-phrased; deliberate spend — NOT added to always-on e2e)** (AC: 1, 2, 5, 6, 7)
  - [x] **The real flow end-to-end (AC 1, 5, 7):** `npm run dev`, log in as the test account, enter a rich Erica-style Context, pick a multi-card spread, submit. Outcomes to observe: the loading line appears on Context Entry; at ~30s the AppSync ceiling fires and recovery takes over **invisibly** — the user experience is loading → Results with no error flash; Results shows the drawn cards (full pattern text — rehydration worked), ≤3 Current Events, the essay in visibly larger, wider-leaded type in a narrower column than the cards. Screenshot. Then verify **DailyUsage incremented by exactly 1 and MonthlySpend by exactly 0.03** (aws cli) — the recovered timeout consumed one unit, not two (the never-resubmit invariant, live).
  - [x] **Native copy (AC 4):** highlight an essay phrase, copy, paste outside the browser — it's the plain text.
  - [x] **Divider count (AC 3):** exactly one ❦ on Results (bottom), still two on Context Entry.
  - [x] **Daily cap live (AC 6):** set Config `dailyLimit` = current used count (aws cli update-item); submit from the UI → the screen degrades to Rate-Limited Intake (no error banner), MonthlySpend unchanged. Also reload the app → Rate-Limited Intake directly (the refreshed-flag path).
  - [x] **Monthly stop live (AC 6):** set MonthlySpend `spent` = `monthlyBudget`; restore `dailyLimit` first so the daily gate isn't the one firing; submit → the monthly inline message renders, Context preserved.
  - [x] **Restore state** to Task 0's recorded values; one more normal generation confirms the app is healthy (this is one of the budgeted paid calls).
  - [x] `GENERATION_FAILED`'s live path is not forced (breaking Bedrock live = corrupting config — same call as 3.2); its evidence is the unit/AppAuth tests. Say so in the record; don't fake it.
  - [x] Narrow-viewport eyeball (~375px): cards single-column, essay column full-width readable, no horizontal scroll (UX-DR18).
  - [x] Both Playwright modes green, untouched: with credentials (4 tests) and without (2 tests). **Do not add a generation e2e** — authenticated generation stays deliberate-only (Epic 2 retro item #4; it burns real money on every CI-ish run).
- [x] **Task 7: Close out (Definition of Done)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
  - [x] Sweep the diff and this story file for live credentials — this story's traps: no real Guide/Context text from the live run committed anywhere (screenshot goes in implementation-artifacts only if it contains no personal context — use a synthetic test Context for the screenshotted run), test creds env-only, `playwright/.auth/` still untracked.
  - [x] Story-authored copy (timeout note, two error strings, `← Back` interim) listed in the completion notes for Tony's review.
  - [x] Commit and push to `main`.

## Dev Notes

### The one design decision that shapes everything: recovery is the happy path

3.2's live verification measured **both** real generations at ~30.6–30.7s — past AppSync's hard, non-configurable 30s mutation ceiling. The Lambda is NOT killed at 30s: it runs to its own 60s timeout, persists the Session, and the counters stand. So for a full generation the client will *routinely* see an error response for a request that **succeeded and was paid for**. That drives everything:

- The baseline-then-poll recovery in Task 2 is the primary render path for slow generations, not exception handling. Design and test it as first-class.
- Misclassifying a timeout as `GENERATION_FAILED` without attempting recovery would show "nothing was used up" for a request that consumed a unit and produced a Guide the user never sees — the worst possible outcome (lies + lost money). The classification order in Task 2 (codes first, recovery for everything else) is load-bearing.
- The 3.2 payload duplicates what Session stores *precisely so that* fast generations render straight from the mutation and slow ones render from the Session — same result object either way.
- **Never resubmit on timeout.** The first Lambda is still running. Pinned by AppAuth test (c) and the live DailyUsage check in Task 6.
- NFR5's ~20s target is currently ~31s in reality; the static loading line is the spec'd treatment regardless (EXPERIENCE.md). Record observed latency again in the completion notes — it feeds NFR5's "revisit once benchmarked" and any future async/subscription correct-course conversation (which is Tony's call, not a story-level move).

### What already exists — do not rebuild any of this

- **`ContextEntry.jsx`** — form, validation, inert-CTA logic, Rate-Limited Intake, quick-draw bridge, `onOrient(context.trim(), spreadKey)` contract: all built (3.1). This story adds busy/error rendering INSIDE it; the submit contract and all existing markup stay.
- **`App.jsx`** — `rateLimited` state + fail-open `getOrientationStatus` fetch (3.2), the whole Quick Draw engine, auth state machine, `AccountBar`. `handleOrient` and `guideResult` slot in; nothing existing is restructured.
- **`CardDisplay.jsx`** — renders a full deck card + position label + inverted treatment, unchanged since the original app (UX-DR6 mandates reuse). Rehydration exists exactly so this component needs zero changes.
- **`SpreadView.jsx`'s `gridClass(n)`** — the responsive card-grid mapping for 1–5 cards. Export it (Task 4); don't fork it.
- **`OrnamentalDivider.jsx`** — built in 3.1 as its own file explicitly "because Story 3.3 reuses it on Orientation Guide Results." This is that reuse.
- **`src/utils/orientation.js`** — `getOrientationStatus()` with the string-parse guard is the template for both new functions.
- **`FULL_DECK` / `SPREADS`** (`src/data/systemsTarot.js`, `src/utils/deck.js`) — card data and spread labels/positions/descriptions. Derive everything; hardcode nothing (project-context hard rule; the server draws from these same modules, which is why name-based rehydration is sound).
- **Note-panel treatment** (`border-gray-700 bg-indigo-900/40 …`) — 3.1's rate-limit note classes, reused for the Tavily-timeout note: same "playful aside" visual family, zero new styles.

### Scope decisions

- **Interim `← Back` on Results (story-authored):** 3.4 builds the two real redraw actions. Shipped without any action, Results is a dead end — the screen is a transient view-state (no route, reload bounces to Context Entry per EXPERIENCE.md State Patterns), so the only exit would be reloading the page or logging out; commits to `main` auto-deploy to real users. The 3.1 bridge precedent applies (system must keep working end-to-end, not just satisfy listed ACs): one secondary `← Back` in exactly the row 3.4 will replace, flagged for Tony. Do not build either redraw action early — "Provide another observation"/"Tweak existing observation" carry 3.4's AC semantics (clear vs. pre-fill), and the `context` field stored in `guideResult` is the seam 3.4 will use.
- **Daily-limit degrade loses typed Context** — accepted: EXPERIENCE.md specs whole-screen replacement ("the CTA and screen are replaced, not disabled in place"), and the server already rejected the request. Don't engineer Context preservation across the degrade.
- **No `groundednessScore` anywhere** — 3.5's field; it doesn't exist in the schema yet.
- **Results screen state lives in App memory only** — no router, no URL, no persistence. "Reloaded/revisited directly → bounces to Context Entry" (EXPERIENCE.md) falls out of this for free; don't add session-restore-on-load (viewing PAST sessions is not in any story's scope this release).

### Architecture compliance checklist (the ADs that bind this story)

- **AD-1:** plain JSX in `src/`, no TypeScript, no new dependencies of any kind (everything needed is present).
- **AD-2:** root-relative paths only; no routing introduced at all.
- **AD-4/AD-9 (client side of the line):** the client READS Sessions (owner-read rule) and calls the two custom operations; it never writes Session/DailyUsage/MonthlySpend/Config — no `client.models.X.create/update` anywhere in this story.
- **AD-12:** Quick Draw untouched — the Results screen and recovery path never touch `encodeDraw`/`decodeDraw`, and no draw code renders on Results (Sessions are not shareable draws; highlight-and-copy is the sharing mechanism, UX-DR16).
- **AD-14:** timeout-with-fallback is SUCCESS — the note renders on a normal Results screen; never style it as an error.
- **NFR2/NFR4:** all enforcement/consumption logic is server-side (3.2); this story renders outcomes and must not re-derive limits client-side. The `rateLimited` flag stays fail-open.
- **NFR7:** Session queries return only the caller's own records (owner-read); nothing new to do, but don't cache Sessions outside App state (sign-out clears `guideResult`).
- **UX-DR1/7/17/18/19:** existing tokens only, dark-only, label on every control (`h2`s are headings, the back button has its text), single responsive layout, copy byte-exact from the table.

### Previous story intelligence (3.2 + 3.1)

- 3.2's review rounds hammered one theme: **contract edges** (inherited object keys, `undefined` marshalling, string-vs-parsed JSON). The client-side equivalents here: `.includes()` code matching (never `===`), string-parse guards on every `a.json()` read, and `FULL_DECK.find` returning `undefined` handled.
- The `a.json()`-arrives-as-string trap is *proven* (3.2 hit it live on `getOrientationStatus`). Model-read `a.json()` fields (Session `cards`/`currentEvents`) get the same guard — Amplify's serialization behavior differs by path; the guard costs one line and is already the house pattern.
- The `Account couldn't load` token-persistence race (retro item #9, still open): `handleOrient` runs on user action long after sign-in settles, so it shouldn't hit the race — but if live verification reproduces anything auth-flavored, capture evidence for item #9, don't debug inline.
- 3.1's formula (zero-to-few review findings): byte-exact class-string reuse, ⚠️ traps inline in tasks, role-scoped `exact`/`level` queries, DI props + module mocks per the established seams, settled-state assertions, derive-from-source-modules-not-hardcode.
- Git (last 5 commits): 3.2's three review rounds all landed in `amplify/functions/**` — the backend contract this story consumes is freshly hardened and frozen; nothing in `src/` changed since 3.1's merge except `App.jsx`/`AppAuth.test.jsx`/`orientation.js` (3.2 Task 5), which are exactly the files this story extends.

### Latest tech notes (web-verified 2026-07-18)

- **AppSync 30s hard limit** — unchanged, non-configurable (verified during 3.2; the measured 30.6–30.7s failures are this ceiling).
- **Amplify Gen 2 `client.models.X.list`** — returns `{ data, nextToken, errors }`; pass `{ nextToken }` to continue; filters evaluate per-page after the read, so a page can be empty while `nextToken` is set — loop until `nextToken` is null ([Amplify Gen 2 query docs](https://docs.amplify.aws/react/build-a-backend/data/query-data/)). This story's `getNewestSession` loops without a filter and compares `createdAt` client-side — simplest correct form at friend scale.
- **`a.json()` return shape** — not consistently documented across custom-op vs model-read paths; the defensive `typeof === 'string' → JSON.parse` guard (already in `orientation.js`) is the house answer. Do not assume parsed.
- No new libraries, no version changes — nothing else to research; the AWS-SDK/Amplify surface this story touches is the one 3.2 just live-verified.

### Project Structure Notes

- New: `src/components/OrientationGuideResults.jsx`, `src/components/OrientationGuideResults.test.jsx`.
- Updated: `src/utils/orientation.js` (+`generateOrientationGuide`, +`getNewestSession`), `src/App.jsx` (`guideResult` state, `handleOrient`, render branch, sign-out clear), `src/components/ContextEntry.jsx` (busy/error states only), `src/components/ContextEntry.test.jsx` (additive), `src/AppAuth.test.jsx` (mock extension + new tests), `src/components/SpreadView.jsx` (**only** `export` added to `gridClass`).
- NOT touched: `amplify/**` (zero backend changes — if you think you need one, stop and re-read the contract table), `CardDisplay.jsx`, `OrnamentalDivider.jsx`, `SpreadSelector.jsx`, `PublicLanding.jsx`, `src/utils/deck.js`, `src/data/**`, `e2e/**`, `playwright.config.js`, `package.json`, `vite.config.js`.

### References

- [Source: epics.md#Story-3.3] — story + 4 ACs; [#Epic-3] — 3.2/3.3/3.4 split rationale (3.3 = viewing the results), FR8/UX-DR11 binding
- [Source: _bmad-output/implementation-artifacts/3-2-…md#Contract-values / #Dev-Notes] — payload shape, frozen error codes, the AppSync-30s finding and "client-side recovery (query own latest Session on timeout) is 3.3's concern," measured latency, `onOrient` deliberately left unwired for this story
- [Source: _bmad-output/implementation-artifacts/3-1-…md] — ContextEntry prop contract (`onOrient`, `initialContext`), OrnamentalDivider built-for-3.3 note, collision-trap protocol, bridge-copy precedent
- [Source: EXPERIENCE.md#State-Patterns] — "Generation in flight" (loading copy, stays on Context Entry), "Generation failed outright" (inline error, no unit consumed, retry with Context), "Daily Orientation Limit exhausted" (degrade), "Results reloaded/revisited → bounces to Context Entry"; [#Component-Patterns] — Orientation Guide Essay (continuous prose, below events, above redraw), Card Display, Redraw Actions (3.4's, not this story's); [#Interaction-Primitives] — highlight-and-share is THE sharing mechanism, no confirmation dialogs
- [Source: DESIGN.md#Typography] — `body-essay` 18px/1.75 + ~65ch measure; [#Layout-&-Spacing] — section-gap 48px between Results blocks, `max-w-2xl` essay vs wider card column; [#Components] — ornamental-divider tokens, button-secondary for the actions row; [#Do's-and-Don'ts] — essay measure + divider confinement
- [Source: mockups/orientation-guide-results.html] — layout order (header → Your Draw grid → Current Events panel → essay → divider → actions), section-label treatment, essay paragraph spacing; illustrative only where it conflicts with the spine
- [Source: ARCHITECTURE-SPINE.md#AD-6/#AD-14] — why timeout ≠ failure and what got rolled back vs. counted; [#AD-9] — Session owner-read is what makes the recovery query authorized; [#AD-12] — Quick Draw isolation
- [Source: amplify/functions/orientation-guide/handler.ts] — the literal return payload + `CurrentEvent` fields; [amplify/data/resource.ts] — Session model + owner-read rule
- [Source: src/App.jsx, src/components/ContextEntry.jsx, src/components/SpreadView.jsx, src/components/CardDisplay.jsx, src/utils/orientation.js] — the exact code being extended
- Web-verified 2026-07-18: [Amplify Gen 2 list/pagination](https://docs.amplify.aws/react/build-a-backend/data/query-data/)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Follow the story task order with red-green-refactor: add thin orientation clients, then App orchestration, Context Entry states, Results UI, and the specified unit/integration coverage.
- Preserve the existing Quick Draw and authenticated-state structure; keep timeout recovery in `App.jsx` and make the mutation single-shot.
- Complete deliberate live verification against the deployed sandbox, restore the recorded usage/configuration baseline, then run every close-out gate before commit and push.

### Debug Log References

- 2026-07-19 UTC — Task 0 baseline: 127/127 unit tests, lint, typecheck, build, anonymous Playwright 2/2, and authenticated Playwright 4/4 passed. AWS SSO required a normal refresh, after which the deployed Session model and guide operations were confirmed.
- 2026-07-19 UTC — Live restoration baseline: Config `dailyLimit=5`, `monthlyBudget=30`; dedicated test-account DailyUsage `count=2`; MonthlySpend `spent=0.06`.
- 2026-07-19 UTC — Task 1 red-green-refactor: four new orientation-client tests failed on missing exports, then passed after adding the mutation wrapper and exhaustive Session pagination/normalization. Full suite: 131/131.
- 2026-07-19 UTC — Task 2 red-green-refactor: three App orchestration tests first failed with no submit wiring, then passed for direct success, daily-limit degradation, and timeout recovery. Added Back and sign-out state-hygiene coverage; full suite: 135/135.
- 2026-07-19 UTC — Task 3 red-green-refactor: four Context Entry tests failed before busy/error state existed, then passed with byte-exact loading, generic, and monthly copy plus duplicate-submit/retry coverage. Added App deadline and frozen-code assertions; full suite: 141/141.
- 2026-07-19 UTC — Task 4 red-green-refactor: Results contract tests failed against the temporary Task 2 seam, then passed after full card rehydration, event/fallback, essay, divider, and action rendering. Full suite: 148/148.
- 2026-07-19 UTC — Task 5 matrix audit: all named Results, Context Entry, App orchestration, recovery-deadline, status-refresh, and sign-out cases are present; full suite remains 148/148 across 17 files.
- 2026-07-19 UTC — Task 6 HALT: the live mutation reached `orientation-guide` but returned `GENERATION_FAILED` in 494 ms and rolled its reservation back. A minimal Bedrock Converse call succeeded (`end_turn`), while an in-memory check of the Lambda's deployed Tavily credential returned HTTP 401 (`Unauthorized: missing or invalid API key`). DailyUsage and MonthlySpend remained at the Task 0 baseline (2 / $0.06), no Session was created, Config remained 5 / $30, and the temporary deliberate-generation Playwright spec was removed.
- 2026-07-19 UTC — Task 6 retry remained HALTed: Tavily again returned HTTP 401. The refreshed `TAVILY_API_KEY` is present in the Amplify sandbox secret store, but an in-memory comparison confirmed the deployed Lambda environment still contains a different value. A sandbox/backend deployment is required to propagate the secret; none was started because this frontend-only story explicitly prohibits an agent-initiated sandbox deploy.
- 2026-07-19 UTC — After Tony completed the sandbox deploy, Amplify's unchanged dynamic secret reference had still left the Lambda on the old value. The stored version-2 secret itself passed Tavily with HTTP 200; propagating that same value directly to the sandbox Lambda environment made the deployed check pass without any repo or schema change.
- 2026-07-19 UTC — Task 6 live verification: a synthetic Decision flow showed loading then Results with no error flash; the persisted invocation completed at the AppSync boundary (29.846s Lambda duration) and usage advanced exactly once from 3 / $0.09 to 4 / $0.12. The screenshot verifies four rehydrated cards with full pattern content, three Current Events, visibly larger/wider-leaded constrained essay prose, one bottom divider, native selected/copied text, and a one-column 375px layout without horizontal overflow.
- 2026-07-19 UTC — Task 6 limits and restoration: `dailyLimit=4` degraded the UI to Rate-Limited Intake and survived reload with MonthlySpend unchanged; `spent=monthlyBudget` rendered the monthly inline message with Context preserved. Temporary overrides were restored to Config 5 / $30 and true spend. A final healthy generation rendered in 29.636s and advanced usage exactly once from 4 / $0.12 to 5 / $0.15. `GENERATION_FAILED` was not live-forced; unit/AppAuth coverage remains its evidence. Permanent Playwright modes passed 4/4 credentialed and 2/2 anonymous, and the deliberate generation spec was removed.
- 2026-07-19 UTC — Task 7 gates: 148/148 unit/integration tests, lint, typecheck, production build, credentialed Playwright 4/4, anonymous Playwright 2/2, and `git diff --check` passed. The required `gridClass` named export received a one-line Fast Refresh lint exception; the full suite remained green.
- 2026-07-19 UTC — Task 7 sweep: changed-file inventory matches the File List; no credential values or live personal Guide/Context text are present. The screenshot contains only synthetic cooperative context, and `playwright/.auth/` remains ignored.
- 2026-07-19 UTC — Task 7 implementation commit `4505580` (`Add Orientation Guide results screen`) pushed successfully to `origin/main`.
- 2026-07-19 UTC — Step 9 completion validation: every task/subtask is checked, the File List and permitted story sections are complete, and the final 148/148 regression passed before moving the story to review.

### Completion Notes List

- Task 0 complete: local, browser, authentication, AWS credential, deployed-schema, and live sandbox-state gates are green; no sandbox deployment was performed.
- Task 1 complete: added thin, string-safe guide mutation and newest-Session read clients, including empty-page pagination and newest-by-server-time selection.
- Task 2 complete: wired single-shot guide generation, frozen-code classification, 5-second/75-second newest-Session recovery, result state priority, status refresh, and sign-out/back clearing without changing Quick Draw behavior.
- Task 3 complete: added in-place async loading, duplicate-submit blocking, inline frozen-code error classification, and one-click retry while preserving Context and Spread.
- Task 4 complete: built the responsive Results screen from existing deck/spread/card/divider primitives, with one bottom divider, constrained body-essay prose, graceful missing-card filtering, and native copy behavior left untouched.
- Task 5 complete: added 21 story-focused UI/orchestration assertions plus 4 thin-client tests while preserving every pre-existing 3.1 assertion.
- Task 6 complete: live synthetic Results, native copy, divider count, responsive layout, exact-once usage, daily degradation/reload, monthly stop/context preservation, restored configuration, and final provider health all passed; permanent Playwright remained generation-free.
- Task 7 copy review for Tony: story-authored strings are `The news is slow today — this Guide worked from the cards and your own words alone.`, `Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.`, `Everyone's shared monthly Guide budget is spent — Orientation Guides return when the month rolls over. Quick Draw is always free.`, and the interim action `← Back`.
- Task 7 complete: every gate, artifact/credential sweep, story record update, and implementation commit/push requirement passed.

### File List

- _bmad-output/implementation-artifacts/3-3-view-the-orientation-guide-results-screen.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/utils/orientation.js
- src/utils/orientation.test.js
- src/App.jsx
- src/AppAuth.test.jsx
- src/components/OrientationGuideResults.jsx
- src/components/ContextEntry.jsx
- src/components/ContextEntry.test.jsx
- src/components/OrientationGuideResults.test.jsx
- src/components/SpreadView.jsx
- _bmad-output/implementation-artifacts/3-3-orientation-guide-results.png

## Change Log

- 2026-07-18: Story created via create-story workflow (ultimate context engine analysis) — status ready-for-dev.
- 2026-07-18: Implemented the Orientation Guide submit/recovery flow, loading and frozen-error states, responsive Results screen, contract/UI coverage, and deliberate live acceptance verification.
- 2026-07-23: Marked done after Story 3.8's integrated review verified the retained Results UI, loading/error treatment, accessibility behavior, and replacement exact-Session orchestration.

## Architecture Correction and Review Freeze — 2026-07-19

Story 3.3's Results UI, loading/error presentation, accessibility behavior, card rehydration, Current Events treatment, essay rendering, and live evidence remain valid.

Its timeout-recovery architecture was a necessary temporary response to Story 3.2's measured AppSync ceiling, but it is superseded by approved Story 3.8.

The following Story 3.3 contracts are temporary and must not be expanded or treated as current architecture:

- Calling a mutation that waits for and returns the complete Guide.
- Establishing a pre-submit newest-Session baseline.
- Listing all owner Sessions during recovery.
- Selecting a newer Session by `createdAt`.
- Treating an unclassified mutation error as the normal completion path.
- Holding the only active result/recovery identity in transient React state.

Story 3.8 replaces those contracts with prompt acknowledgment, a client-generated request/Session ID, exact-Session polling, durable lifecycle states, and reload-safe active-ID recovery.

No further development or standalone review effort should be spent hardening the temporary newest-Session polling path. Story 3.3 remains in `review`; after Story 3.8 is implemented, the retained Story 3.3 UI and the replacement orchestration are reviewed together before either path is considered complete.
