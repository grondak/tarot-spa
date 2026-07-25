---
baseline_commit: c27971e
---

<!-- baseline_commit was 6672642 at story creation; corrected at review — Task 0 landed
     Story 3.8's pre-existing re-review work as c27971e before any 3.4 source change,
     so c27971e is this story's true code baseline. -->

# Story 3.4: Redraw from the Results screen

Status: done

## Story

As a user viewing their Orientation Guide Results,
I want to either start fresh or tweak my observation and try again,
So that I can get another attempt if the first one didn't land or I want to add detail.

*(Frontend-only story — zero `amplify/` changes. Prerequisite satisfied: Story 3.8's durable start and exact-Session tracking contract is deployed and verified — Story 3.8 is `done`. This story replaces the interim single "← Back" button that 3.3 shipped as an explicitly flagged placeholder — "3.4 replaces this row with 'Provide another observation' / 'Tweak existing observation'" — with the two real redraw actions UX-DR11 specifies. Nothing about generation, reservation, or the durable contract itself changes; this story only decides what state the user lands back on Context Entry with.)*

## Acceptance Criteria

1. **Given** a completed Orientation Guide, win or miss, **when** the user views Results, **then** they see two distinct actions — "Provide another observation" and "Tweak existing observation" (UX-DR11)
2. **Given** the user selects "Provide another observation", **when** they're returned to Context Entry, **then** the Context field is empty
3. **Given** the user selects "Tweak existing observation", **when** they're returned to Context Entry, **then** the prior Context text is pre-filled for editing
4. **Given** either redraw action is used, **when** the new request is submitted, **then** it uses Story 3.8's asynchronous start contract and is subject to the same Daily/Monthly limit rules as any other request (Story 3.2)

**Not in scope (read before touching anything):** "win or miss" in AC 1 refers to the *quality* of the essay, not the Session's lifecycle status — a `FAILED` Session never reaches the Results screen (it renders the inline error / rate-limit degrade instead, per Story 3.8's `followSession`), so both actions are simply always present, unconditionally, on every Results render. There is no "was this guide good?" heuristic to build — the PRD is explicit that a miss gets no special in-app recovery in v1 (`prd.md` §2.3 UJ-2 / edge-case review: "a redraw simply costs another Daily Orientation Limit unit").

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. **Valid AWS session at story start.** This story ships zero `amplify/` changes, but live verification drives 2 real paid generations through the deployed sandbox to prove the redraw actions feed back into Story 3.8's real submit path (AC 4).
2. **Real spend, small:** ~2 full generations (~$0.06 at the $0.03 estimate). No limit-rejection tests needed — 3.2/3.8 already proved those live.
3. `TAROT_E2E_EMAIL` / `TAROT_E2E_PASSWORD` available in the agent's shell (env-only, as always).
4. **Heads-up, not a blocker:** the working tree currently carries a large *uncommitted* diff (~2,270 lines across 23 tracked files, plus two new untracked function directories and `docs/`) that is Story 3.8's finished, reviewed, and already-deployed "Runtime and infrastructure re-review — 2026-07-23" work (alarms, DLQs, IAM narrowing, admission throttling, the automated stale-`PENDING` reconciler, 7-day durable retention). It was never committed to git even though Story 3.8's own record says "committed and push to main" was done at each round. Task 0 below has the agent commit that pre-existing work as its own dedicated commit before starting 3.4's work — you don't need to do anything, just don't be surprised when the first commit on this story's branch isn't 3.4's own diff.

## Contract values (frozen — set by 3.3/3.8, this story only consumes them)

| Item | Value |
|---|---|
| `guideResult` shape (state already held in `App.jsx`) | `{ spreadKey, context, sessionId, cards, currentEvents, guide, tavilyTimedOut }` — `context` is the exact string the user submitted for this Session; it is what "Tweak existing observation" pre-fills |
| `ContextEntry` prop contract (unchanged, already supports this story) | `initialContext` / `initialSpreadKey` seed the component's local `useState` at mount; `onOrient(context, spreadKey)` is the one submit entry point, unchanged since 3.8 |
| `App.jsx`'s `handleOrient(context, selectedSpreadKey)` | Already implements the full Story 3.8 contract end-to-end (UUID request id, `startOrientationGuide`, `followSession` polling, lifecycle rendering). Redraw does **not** call this directly — it only sets state so the user lands on a correctly-seeded Context Entry; the user's own next tap of "Help Me Orient" is what calls it, exactly like a first-time request |
| Secondary-button treatment (byte-exact, reused a 3rd/4th time) | `rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` — the exact classes on the existing interim `← Back` button (`OrientationGuideResults.jsx`), `Back to Help Me Orient` (`ContextEntry.jsx`), and `SpreadView`'s own `← Back` |
| Redraw row layout (mockup-confirmed) | `.redraw-row { display:flex; gap:12px; justify-content:center; flex-wrap:wrap }` → Tailwind `flex flex-wrap justify-center gap-3` (`gap-3` = 12px) |
| `SPREADS` (`src/utils/deck.js`) | Validity source for any spread key — not touched by this story, cited for completeness since `orientSpreadKey` passes through it elsewhere in `App.jsx` |

## Copy (exact strings — no new story-authored copy this time)

Both button labels are spec-verbatim from `epics.md` AC 1 / `EXPERIENCE.md`'s Redraw Actions row / the `orientation-guide-results.html` mockup — nothing to flag for Tony.

| Element | Copy | Source |
|---|---|---|
| First redraw action | `Provide another observation` | epics.md AC 1, EXPERIENCE.md Component Patterns, mockup |
| Second redraw action | `Tweak existing observation` | epics.md AC 1, EXPERIENCE.md Component Patterns, mockup |

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight + working-tree intelligence gate (standing retro item)** (AC: none — gate)
  - [x] Confirm `git log -1` is `6672642` before any change (this story's baseline).
  - [x] Run every closeout gate against the **current, uncommitted** tree exactly as it sits: `npm test` (223 passing as of story creation — re-establish the real number, don't hardcode it), `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e` with and without `TAROT_E2E_EMAIL` set. All must be green before this story adds anything.
  - [x] **Do not `git stash`, `git reset`, `git checkout --`, or otherwise discard the pre-existing uncommitted diff.** It is Story 3.8's finished "Runtime and infrastructure re-review — 2026-07-23" work (read that section of `3-8-make-orientation-guide-generation-durable-and-asynchronous.md`'s Dev Agent Record before touching any file it lists) — already implemented, tested, and deployed to the sandbox per its own record, just never committed. `git status --short` shows it: 23 modified tracked files plus untracked `amplify/functions/orientation-alert/`, `amplify/functions/orientation-reconciler/`, `docs/`.
  - [x] Commit that pre-existing diff now, as its **own dedicated commit**, before writing any 3.4 code — keep 3.4's own diff isolated and reviewable on top of it. Suggested message: describe it as Story 3.8's runtime/infrastructure re-review landing (alarms, DLQs, IAM narrowing, admission throttling, automated reconciler, 7-day retention) — cite the story file's own re-review section, don't re-litigate whether it was "supposed to" already be committed.
  - [x] AWS credentials valid; read live sandbox state (Config `global`, test account's DailyUsage for today UTC, MonthlySpend this month) — record the numbers for the completion notes (no restoration needed afterward; this story only adds 2 normal paid generations, nothing to roll back).
  - [x] Log in via `npm run dev` with the test credentials; reach the existing interim Results `← Back` button once to confirm the pre-3.4 baseline renders correctly before changing it.
- [x] **Task 1: `OrientationGuideResults.jsx` — replace the interim Back with the two redraw actions** (AC: 1)
  - [x] Replace the `onBack` prop with `onRedrawFresh` and `onRedrawTweak` in the function signature: `export default function OrientationGuideResults({ result, onRedrawFresh, onRedrawTweak })`.
  - [x] Replace the single-button actions row (currently `<div className="mt-12 flex justify-center">…← Back…</div>`) with a two-button row, same secondary-button classes reused verbatim on both, `Provide another observation` first then `Tweak existing observation` second (mockup order, matches AC 1's listing order):
    ```jsx
    <div className="mt-12 flex flex-wrap justify-center gap-3">
      <button
        type="button"
        onClick={onRedrawFresh}
        className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        Provide another observation
      </button>
      <button
        type="button"
        onClick={onRedrawTweak}
        className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        Tweak existing observation
      </button>
    </div>
    ```
  - [x] Nothing else in this file changes — cards, events, essay, and the single bottom `OrnamentalDivider` are all 3.3's proven, untouched code.
- [x] **Task 2: `App.jsx` — wire the two redraw handlers, retire `handleGuideBack`** (AC: 2, 3, 4)
  - [x] Replace `handleGuideBack` with a parametrized helper plus two thin wrappers (this is a like-for-like port of `handleGuideBack`'s existing cleanup — same flow-id bump, same delay cancellation, same active-session clear, same busy/error reset — the only new behavior is the `preserveContext` branch):
    ```js
    function handleRedraw(preserveContext) {
      orientationFlowId.current += 1;
      cancelOrientationDelays();
      clearActiveOrientationSession(guideResult?.sessionId);
      orientationSubmitting.current = false;
      setOrientBusy(false);
      setOrientError(null);
      setOrientContext(preserveContext ? (guideResult?.context ?? '') : '');
      setOrientSpreadKey(null);
      setGuideResult(null);
    }

    function handleRedrawFresh() {
      handleRedraw(false);
    }

    function handleRedrawTweak() {
      handleRedraw(true);
    }
    ```
  - [x] Update the render branch: `<OrientationGuideResults result={guideResult} onRedrawFresh={handleRedrawFresh} onRedrawTweak={handleRedrawTweak} />` — remove the old `onBack={handleGuideBack}` wiring entirely, no vestigial prop left behind.
  - [x] **Scope decision — Spread resets to unselected for BOTH actions, on purpose:** neither AC 1–4 nor UX-DR11 nor the mockup says the prior Spread carries over into "Tweak existing observation" — only Context is specified ("prior Context text is pre-filled for editing"). Setting `orientSpreadKey` to `null` in both branches is the spec-literal choice and avoids inventing UI the spine is silent on (a repeatedly-flagged anti-pattern in this project's prior stories — see 3.3's "don't invent UI the spine is silent on" precedent for Current Events links). The existing CTA-disabled logic in `ContextEntry.jsx` (`!spreadKey`) already handles this correctly with zero changes there. If Tony wants the Spread to persist through Tweak, that's a deliberate follow-up story, not a silent addition here.
  - [x] **Do not touch `restoreOrientationInput` / `orientRecoveryRevision`.** That machinery exists for a *different* feature — restoring Context/Spread after a `FAILED` or malformed-session recovery while `ContextEntry` may already be mounted (hence the key-remount trick to force it to re-read new initial props). Redraw always transitions from the Results branch to the Context Entry branch of the top-level conditional render (`guideResult ? <Results/> : spreadKey ? <SpreadView/> : <ContextEntry/>`), which is a genuine fresh mount every time — `ContextEntry` picks up the new `initialContext`/`initialSpreadKey` props at mount for free, no key bump needed. Conflating the two mechanisms would be redundant and risks the wrong console/test behavior.
- [x] **Task 3: Tests** (AC: all)
  - [x] `src/components/OrientationGuideResults.test.jsx`:
    - Rename the `onBack` fixture variable and prop wiring in `renderResults` to `onRedrawFresh` / `onRedrawTweak` (two separate `vi.fn()`s).
    - Update "has exactly one aria-hidden ornamental divider above the Back action" → assert the divider (glyph count === 1, `aria-hidden`) sits above the actions row, then assert both `Provide another observation` and `Tweak existing observation` buttons are visible (role-scoped `getByRole('button', { name: … })`).
    - Replace "calls onBack once and adds no custom sharing affordance" with two tests: clicking `Provide another observation` calls `onRedrawFresh` exactly once and `onRedrawTweak` zero times; clicking `Tweak existing observation` calls `onRedrawTweak` exactly once and `onRedrawFresh` zero times. Keep the "no custom sharing affordance" (`queryByRole('button', { name: /copy|share/i })`) assertion in one of them.
  - [x] `src/AppAuth.test.jsx`:
    - Retarget the three existing Results-screen `{ name: '← Back' }` queries (the ones that follow a `findByText('The generated guide.')` — NOT the `SpreadView` Quick Draw `← Back`, which is unrelated and stays as-is) to `{ name: 'Provide another observation' }`. These are: the stored-ID-clearing test, the "doesn't clear another tab's newer active ID" test, and the "ignores a post-success rate-limit refresh" test. Behavior is unchanged (Fresh is the direct behavioral descendant of the interim Back button — full clear), only the button name moves.
    - ADD: after reaching Results, clicking `Provide another observation` → `getByLabelText('Context')` has value `''`, `screen.queryByRole('button', { pressed: true })` is `null` (`SpreadSelector` sets `aria-pressed="false"`, not absent, on every option once in selection mode — the `pressed`-scoped role query is the precise "nothing selected" check, not an attribute-presence check), and the active-session localStorage key is cleared (AC 2).
    - ADD: after reaching Results with a known Context (e.g. `'A decision.'`), clicking `Tweak existing observation` → `getByLabelText('Context')` has that exact value, `screen.queryByRole('button', { pressed: true })` is `null` (pins the scope decision above), and the active-session localStorage key is cleared (AC 3).
    - ADD: after either redraw action, filling in a (possibly edited) Context, picking a Spread, and submitting again drives `startOrientationGuide` with a **new** request id distinct from the original Session's id, and the resulting flow reaches Results exactly the same way a first-time submission does — pins AC 4 (no special-cased "redraw" path exists in the submit machinery; it's the same `handleOrient` every time).
  - [x] Full suite green; no existing assertion deleted without cause — only the three renamed button-name queries, everything else about their behavior stays pinned.
- [x] **Task 4: Live verification (outcome-phrased; deliberate spend — NOT added to always-on e2e)** (AC: 1, 2, 3, 4)
  - [x] **Generation 1 (baseline reach):** `npm run dev`, log in as the test account, submit a real Context + Spread, reach Results. Eyeball: both `Provide another observation` and `Tweak existing observation` render below the essay's single bottom divider, correct labels, secondary-button styling, single row on desktop width.
  - [x] **Tweak path, live (AC 3):** click `Tweak existing observation` → Context Entry renders with the exact submitted Context pre-filled in the textarea, no Spread pre-selected (CTA stays disabled until a Spread is chosen), and reloading the page immediately (before submitting again) lands on that same pre-filled Context Entry rather than resuming a stale Session — confirms the active ID was actually cleared, not just visually.
  - [x] **Generation 2 (AC 4, the real proof):** lightly edit the pre-filled Context, pick a Spread, submit → the full Story 3.8 lifecycle plays out exactly as any first-time request (prompt ack, loading treatment, `PENDING`→`RUNNING`→`SUCCEEDED`, Results renders the new Guide). Verify DailyUsage/MonthlySpend each advanced by exactly 1 / $0.03 for this second submission specifically (compare against the Task 0 baseline + 2, not some other delta) — proves redraw doesn't bypass or double-count the reservation.
  - [x] **Fresh path, live (AC 2):** from this second Results, click `Provide another observation` → Context Entry renders fully blank (no Context, no Spread pre-selected), and an immediate reload confirms no stale resume (same check as the Tweak path).
  - [x] **Narrow-viewport eyeball (~375px):** the two-button row wraps/stacks without horizontal overflow (UX-DR18 continuity, same floor as 3.3's check).
  - [x] Both Playwright modes remain green, untouched — no new always-on paid e2e added; authenticated generation stays deliberate-only (Epic 2 retro item #4).
  - [x] Record final DailyUsage/MonthlySpend delta (+2 generations, ~+$0.06) in the completion notes — nothing needs restoring since these are genuine, intentionally-consumed units, not test overrides.
- [x] **Task 5: Close out (Definition of Done)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
  - [x] Sweep the diff and this story file for live credentials — no real Guide/Context text from the live run committed anywhere, test creds env-only, `playwright/.auth/` still untracked.
  - [x] Confirm two commits exist on `main` in order: (1) Task 0's pre-existing Story 3.8 runtime/infrastructure re-review commit, (2) this story's own `src/` diff. Push both.

### Review Findings

- [x] [Review][Decision] Ratify or redesign the redraw-draft lifecycle — **resolved 2026-07-24: Tony chose accept-and-document.** The four identified edges — (a) failed submission + reload loses the draft (cleared at submit-start, `src/App.jsx:428`) while the inline error says "Your context is still here"; (b) post-Tweak edits never re-sync, reload restores the tweak-time snapshot; (c) unguarded clears can clobber another tab's draft, two-tab Tweak is last-writer-wins (`src/App.jsx:428,582`); (d) any auth loss including ordinary token expiry wipes the draft (`src/App.jsx:171`) — are accepted as friend-scale-tolerable limits of the localStorage draft, with (d) ratified as the deliberate shared-machine privacy default. No code change; the accepted limits are recorded in the supersession note (next finding).
- [x] [Review][Patch] Propagate the authorized localStorage decision into the normative docs: append a supersession note to this story (the frozen Task 2 snippet, contract-table `handleOrient` row, and AD-9 checklist bullet still describe the pre-HALT in-memory-only design), record the accepted draft-lifecycle limits from the resolved decision above, and amend `_bmad-output/project-context.md`'s "Persist only the active Session id for reload recovery" rule to name the redraw-draft exception — as written, a future story's agent could remove the feature as a rule violation [_bmad-output/project-context.md:74] — applied: supersession record added to Dev Notes, project-context rule amended
- [x] [Review][Patch] Replace the tautological `expect(firstSessionId).not.toBe(secondSessionId)` (two hardcoded literals — can never fail) with an assertion on the actually-submitted request ids, e.g. distinctness of `startOrientationGuide.mock.calls[0][0]` and `[1][0]` [src/AppAuth.test.jsx:986] — applied
- [x] [Review][Patch] Correct the stale `baseline_commit: 6672642` frontmatter — after Task 0 landed `c27971e`, this story's true code baseline is `c27971e`; anyone diffing from the frontmatter attributes ~2,300 lines of Story 3.8 infrastructure to this story [_bmad-output/implementation-artifacts/3-4-redraw-from-the-results-screen.md:2] — applied, with an explanatory comment preserved
- [x] [Review][Defer] "Tweak existing observation" while the last generation exhausted the daily limit lands on the spec'd Rate-Limited Intake (Quick Draw) with the preserved Context invisible until the limit resets — an intersection of AC 1's always-present buttons and UX-DR13's whole-screen degrade, not a code bug; Context is retained in state and draft and resurfaces next day [src/components/ContextEntry.jsx:33] — deferred, pre-existing degrade behavior

### Review Findings — second review (2026-07-25)

Fresh full review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) of the c27971e → working-tree diff, including the 2026-07-24 review round's applied-but-uncommitted patches. Core implementation held up again across all three layers; the weight of the findings is in the prior review round's own artifacts and in test gaps around the draft contract.

- [x] [Review][Decision] Residual draft-lifecycle privacy edges beyond the ratified (a)–(d) — (e) the tweak draft persists in plaintext localStorage indefinitely while the Cognito session stays alive: no TTL, no clear on reaching Results, so the privacy default guards the expired-token shared machine but not the likelier borrowed logged-in device [src/App.jsx:580]; (f) `restoreOrientationInput` (FAILED/malformed-session recovery) writes `orientContext` without syncing or clearing the draft, so a later reload overwrites the recovered Context with a stale draft — a new divergence introduced by draft persistence, distinct from ratified (c) [src/App.jsx:262-271, :93] — **resolved 2026-07-25: Tony chose fix (f), document (e)**; (f) fixed by clearing the draft inside `restoreOrientationInput`'s context branch, (e) appended to the supersession record's accepted-limits list
- [x] [Review][Patch] Story is `done` in every tracking artifact while the entire 2026-07-24 review round (test fix, project-context amendment, supersession record, deferred-work entry, status flips) sits uncommitted — last commit is `7d185f8`; a careless checkout silently reverts a review the record says shipped. Commit and push the review-round changes. [repo working tree] — applied: landed as dedicated commit `484350c` before any second-round code change
- [x] [Review][Patch] The Fresh-clears-draft assertion is vacuous — no test seeds `tarotSpaOrientationRedrawContext` before clicking "Provide another observation", so `expect(...).toBeNull()` passes against a key that never existed; deleting the clear at `src/App.jsx:582` keeps the whole suite green. Seed the draft key first. [src/AppAuth.test.jsx:876-891] — applied: stale draft seeded at Results before the Fresh click
- [x] [Review][Patch] The ratified auth-loss draft wipe (accepted limit (d), the deliberate privacy default) has zero test coverage — only the explicit Log Out path is pinned; no test drives the Hub/`getCurrentUser`-rejection path and asserts draft removal [src/App.jsx:171] — applied: new "wipes the redraw draft on auth loss without an explicit sign-out" test via the Hub-listener technique
- [x] [Review][Patch] Divider/actions-row test weaknesses: the Tweak button gets only `toBeVisible()` (no position check vs the divider), the spec-normative Fresh-before-Tweak order is asserted nowhere (swapping the buttons passes the suite), and `compareDocumentPosition` — a bitmask — is compared with strict `toBe` [src/components/OrientationGuideResults.test.jsx:113-127] — applied: bitmask-safe position checks for divider→Fresh, divider→Tweak, and Fresh→Tweak order
- [x] [Review][Patch] Partial-storage-failure divergence: Tweak ignores `storeOrientationRedrawContext`'s return, so if `setItem` throws while an older, different draft occupies the key (quota exhausted, not fully denied), the in-memory prefill and the persisted draft silently diverge and reload restores the stale draft. Fallback-clear when the store fails. [src/App.jsx:579-583] — applied
- [x] [Review][Patch] The draft helpers' boolean returns are dead code — no caller reads them, unlike the session-key helper whose `false` triggers `failGeneration`; the fallback-clear fix above consumes the store return, drop or use the rest [src/App.jsx:66-82] — applied: store's return now consumed by the fallback-clear; clear's unused return removed
- [x] [Review][Patch] Duplicate `setOrientContext('')` in `refreshAuth`'s catch — unconditional at :172 then again at :183 inside the `sessionWasAuthenticated` branch; the unconditional pair also runs a `removeItem` + no-op state set on every auth event while an unauthenticated visitor sits on the landing screen [src/App.jsx:171-183] — applied: duplicate removed; the unconditional clear at :171-172 stays as the contract-bearing wipe
- [x] [Review][Patch] Denied-storage degradation is tested only for the immediate in-memory prefill — no unmount/re-render pinning the documented degraded reload (blank Context Entry, silently), the most surprising user-visible half of the contract [src/AppAuth.test.jsx:917-936] — applied: denied test now remounts and asserts the blank degraded reload
- [x] [Review][Patch] `OrientationGuideResults`' new callback props lack the codebase-idiomatic no-op defaults (`ContextEntry` defaults every callback); an omitted prop renders a silent dead button [src/components/OrientationGuideResults.jsx:8-11] — applied
- [x] [Review][Patch] `Agent Model Used` remains the template placeholder in a `done` story — record the model or state it was not captured [_bmad-output/implementation-artifacts/3-4-redraw-from-the-results-screen.md:202] — applied: recorded as not captured at dev time
- [x] [Review][Patch] The sprint-status comment still carries the correct-course-gate imperative ("execute immediately before Stories 3.4–3.7") with no record of its disposition — reword to record the gate as satisfied or remove the stale instruction [_bmad-output/implementation-artifacts/sprint-status.yaml:310] — applied: comment now records the gate as satisfied

Dismissed as noise (3): draft cleared on any `getCurrentUser` rejection — consistent with the app-wide auth-loss semantics and ratified limit (d), and Amplify's `getCurrentUser` resolves from local tokens so the transient-network reading is largely theoretical; the 2026-07-24 "tautology fix" assertion being implied by the `toEqual` two lines above — decoration, but removing it is churn; the File List carrying the annotated Story 3.8 landing entries — historically accurate for Task 0 and explicitly annotated, and the record is append-only.

## Dev Notes

### Review supersession record — 2026-07-24

This append-only record supersedes the pre-HALT prose below; the sections it corrects are left as written for history:

- **The frozen Task 2 snippet, the contract-table `handleOrient` row ("Redraw does not call this directly — it only sets state"), and the AD-9 checklist bullet ("redraw only reads already-fetched `guideResult` client state") describe the pre-HALT in-memory-only design and are superseded on the persistence point.** The dev agent HALTed on the contradiction between Task 4's reload wording and project-context's persist-only-the-Session-id rule; Tony resolved it on 2026-07-24 by choosing browser localStorage draft persistence over an API/DynamoDB path.
- **The shipped draft contract:** key `tarotSpaOrientationRedrawContext` stores only the redraw Context draft (a bare string — never cards, Guide, or Session content). Stored by "Tweak existing observation"; seeds `orientContext` at App mount; cleared by Fresh redraw, the start of the next Orientation submission, sign-out, and any auth loss including token expiry (deliberate shared-machine privacy default). Denied storage degrades to in-memory-only prefill without error.
- **Accepted lifecycle limits (code review, Tony's accept-and-document decision, 2026-07-24):** (a) a failed submission followed by a reload loses the draft — it is cleared at submit-start, and the "Your context is still here" copy is true only until reload; (b) edits typed after a Tweak are not re-synced to the draft, so a reload restores the tweak-time snapshot; (c) draft clears are unguarded across tabs (unlike the session key's compare-before-remove), so concurrent tabs can clobber each other's drafts; (d) token expiry wipes the draft before re-login. All four are ratified as friend-scale-tolerable; none blocks this story.
- **(e) — ratified at the second review, 2026-07-25 (Tony: fix (f), document (e)):** while the Cognito session stays alive, a stored tweak draft persists in plaintext localStorage indefinitely — no TTL, no clear on reaching Results — so the privacy default guards the expired-token shared machine but not a borrowed logged-in device. Accepted as friend-scale-tolerable; the auth-loss wipe remains the backstop. The companion edge (f) — recovery-restore leaving a stale draft to overwrite `restoreOrientationInput`'s recovered Context on a later reload — was fixed in code the same day rather than accepted.
- `_bmad-output/project-context.md`'s persistence rule now names the draft exception explicitly.

### What already exists — do not rebuild any of this

- **`App.jsx`'s entire orientation lifecycle** (`handleOrient`, `followSession`, `resumeActiveOrientationSession`, the `ACTIVE_ORIENTATION_SESSION_KEY` localStorage helpers, `orientationFlowId`/`orientationDelays`/`orientationSubmitting` refs) — Story 3.8's durable async contract, fully built and live-verified. This story adds two new *entry points back into Context Entry*; it does not touch how a request is submitted, polled, or resolved.
- **`OrientationGuideResults.jsx`'s entire layout** (cards, Current Events, essay, the one bottom `OrnamentalDivider`) — Story 3.3's proven, untouched code. Only the final actions row changes.
- **`ContextEntry.jsx`** — needs **zero changes**. Its `initialContext`/`initialSpreadKey` props and `onOrient` contract already support everything this story needs; do not open this file expecting to find work.
- **`restoreOrientationInput` + `orientRecoveryRevision`** — a *different* feature (FAILED/malformed-session recovery). Do not merge it with redraw's handlers; see Task 2's explicit note.
- **The secondary-button class string** — already used 3× in this app (`OrientationGuideResults`'s interim Back, `ContextEntry`'s "Back to Help Me Orient", `SpreadView`'s own Back). Reuse it byte-exact a 4th/5th time; do not introduce a new button variant.

### Architecture compliance checklist (the ADs that bind this story)

- **AD-1:** plain JSX in `src/`, no TypeScript, no new dependencies — nothing needed beyond what's already imported.
- **AD-2:** no routing, no base-path touch.
- **AD-9:** Session stays owner-read-only and never browser-written; redraw only reads already-fetched `guideResult` client state (no new `client.models`/`client.queries` calls of any kind).
- **AD-12:** Quick Draw (`encodeDraw`/`decodeDraw`, `SpreadView`) is untouched by this story — redraw only concerns the Orientation Guide Results screen.
- **AD-19:** the eventual new submission after a redraw reuses `handleOrient` verbatim — no second invocation path, no bypass of the request-id/idempotency contract. This is what AC 4 is actually testing: that nothing special-cased was added.
- **UX-DR3:** the single bottom `OrnamentalDivider` stays exactly where 3.3 put it, above the (now two-button) actions row — do not add or move any divider.

### Previous story intelligence (3.3 + 3.8)

- **3.3** explicitly built the interim `← Back` button as a flagged placeholder for this exact story: *"3.4 builds the two real redraw actions... one secondary ← Back in exactly the row 3.4 will replace, flagged for Tony... 'Provide another observation'/'Tweak existing observation' carry 3.4's AC semantics (clear vs. pre-fill), and the `context` field stored in `guideResult` is the seam 3.4 will use."* This story is that exact, anticipated seam — no surprises expected.
- **3.8** rewired `App.jsx`'s entire submit/recovery machinery and left a direct forward note for this story: *"3.4's redraw actions will call this same submit path with a fresh UUID per deliberate submission — that's why `handleOrient` stays a single reusable entry point on App."* Confirms: redraw sets state, the user's own next CTA tap calls `handleOrient` unchanged.
- **Git:** the last commit (`6672642`) is 3.8's initial implementation. Everything since — three additional review rounds, all the way through the 2026-07-23 runtime/infrastructure re-review — is uncommitted in the working tree (see Task 0). There is no additional git-log pattern to learn beyond what's already captured above; the diff itself is backend/infra work this story doesn't touch.

### Project Structure Notes

- Updated: `src/components/OrientationGuideResults.jsx`, `src/components/OrientationGuideResults.test.jsx`, `src/App.jsx`, `src/AppAuth.test.jsx`.
- NOT touched: `src/components/ContextEntry.jsx` and its test (no change needed — see above), `src/utils/orientation.js`, `amplify/**` (zero backend changes — if you think you need one, stop and re-read the contract table), `CardDisplay.jsx`, `SpreadView.jsx`, `SpreadSelector.jsx`, `OrnamentalDivider.jsx`, `PublicLanding.jsx`, `src/utils/deck.js`, `src/data/**`, `e2e/**`, `playwright.config.js`, `package.json`, `vite.config.js`.
- The Task 0 commit touches whatever files Story 3.8's uncommitted re-review already modified (see `git status --short` at story start) — that commit is *prior* work being landed, not new work from this story; keep it separate from the list above.

### References

- [Source: epics.md#Story-3.4] — the 4 ACs verbatim; [#Epic-3] — 3.2/3.3/3.4 split rationale, correct-course gate note (now satisfied — 3.8 is done)
- [Source: _bmad-output/implementation-artifacts/3-3-…md#Scope-decisions] — the interim `← Back` placeholder and its explicit hand-off to this story; [#Contract-values] — `guideResult` shape
- [Source: _bmad-output/implementation-artifacts/3-8-…md#Client-flow-end-to-end] — the exact submit/poll/resolve contract this story's redraw feeds back into; [#Dev-Notes/Previous-story-intelligence] — the direct 3.4 forward-note; [#Runtime-and-infrastructure-re-review] — what the Task 0 pre-existing commit contains
- [Source: EXPERIENCE.md#Component-Patterns] — "Redraw Actions" row (exact button copy + behavior); [#State-Patterns] — "Active Orientation Guide reloaded/revisited": "Deliberately leaving Results, starting a redraw, or signing out clears the active ID"; [#Interaction-Primitives] — redraw is single-click/tap, no confirmation dialog
- [Source: DESIGN.md#Components] — "'Back,' 'Load,' and the two redraw actions on the Orientation Guide Results screen are `button-secondary`"
- [Source: mockups/orientation-guide-results.html] — `.redraw-row` layout (`flex, gap:12px, justify-content:center, flex-wrap:wrap`), button order and copy
- [Source: prd.md §2.3 UJ-2 / edge-case review] — "[ASSUMPTION] A miss gets no special in-app recovery in v1 — a redraw simply costs another unit of the user's Daily Orientation Limit like any other request"
- [Source: ARCHITECTURE-SPINE.md#AD-1/#AD-2/#AD-9/#AD-12/#AD-19] — the binding rules this story must not violate
- [Source: src/App.jsx, src/components/ContextEntry.jsx, src/components/OrientationGuideResults.jsx] — the exact code being extended (all read during story creation)

## Dev Agent Record

### Agent Model Used

Not captured during the 2026-07-23/24 dev sessions (gap noted at the 2026-07-25 second review). Second-review patches: Claude Fable 5 via Claude Code.

### Debug Log References

- 2026-07-23 — Task 0 pre-flight: baseline commit `6672642` confirmed. Under the established Node 24 runtime, 223/223 tests, lint, typecheck, build, anonymous Playwright 2/2, and credentialed Playwright 4/4 passed. The default Node 25 runtime exposed an invalid global `localStorage`; rerunning with the project-established Node 24 toolchain isolated it as environment contamination rather than a repository regression.
- 2026-07-23 — Task 0 Story 3.8 landing: preserved and committed the pre-existing runtime/infrastructure re-review as dedicated commit `c27971e` before any Story 3.4 source edit.
- 2026-07-23 — Task 0 sandbox baseline: Config `dailyLimit=5`, `monthlyBudget=30`; test-account DailyUsage for the current UTC date had no row (effective count `0`); MonthlySpend for July was `0.33`. An existing successful exact Session restored Results through the local app and confirmed the interim `← Back` action without consuming another generation.
- 2026-07-23 — Tasks 1–3 red-green-refactor: component tests first failed on the missing redraw controls; App tests then failed on the unwired callbacks. Added the two exact actions, a shared clear/preserve Context handler, explicit Spread reset, active-ID cleanup, and both-action resubmission coverage. Focused suites and the 228/228 regression passed; lint remained green.
- 2026-07-23 — Task 4 live verification: two distinct exact Sessions reached `SUCCEEDED`; Results showed the exact actions in order below one divider with byte-exact secondary styling. Tweak pre-filled the exact Context, cleared Spread and the active ID, and reused the normal prompt/loading/terminal path with a new UUID. Fresh returned blank, reload did not resume stale Results, and the 375px row wrapped without overflow. DailyUsage moved `0 → 2`; MonthlySpend moved `0.33 → 0.39`.
- 2026-07-23 — Task 4 HALT: after Tweak, a full page reload returned to Context Entry without stale-Session resume but the in-memory prefill was blank. The frozen Task 2 implementation and project context intentionally persist only the active Session ID, while Task 4 says reload should retain the prefilled Context. Adding Context persistence would materially broaden the privacy/state contract and contradict the story's frozen implementation, so that choice requires Tony's direction.
- 2026-07-24 — Task 4 resumed by Tony's decision to persist redraw Context in browser localStorage rather than add an API/DynamoDB path. Red-green coverage now proves exact reload restoration, Fresh/sign-out/new-submit cleanup, and safe degradation when draft storage is denied. The zero-spend live replay of an existing successful Session confirmed exact Context restoration after reload, no Spread selection, cleared active ID, and no stale Results resume.
- 2026-07-24 — Task 5 local closeout: 229/229 tests, lint, typecheck, production build, anonymous Playwright 2/2, credentialed Playwright 4/4, `git diff --check`, credential sweep, and ignored `playwright/.auth/user.json` all passed. The existing Vite >500 kB chunk advisory remains non-failing.
- 2026-07-24 — Task 5 commit/push: Story 3.8's dedicated runtime/infrastructure landing `c27971e` precedes Story 3.4's isolated source commit `f93b707` on `main`; both pushed successfully.

### Completion Notes List

- Task 0 complete: preserved the dirty tree, landed Story 3.8 separately, passed all local/browser gates, captured the live usage baseline, and verified the pre-change Results action without extra spend.
- Tasks 1–3 complete: Results now presents the two specified redraw actions; Fresh clears Context, Tweak preserves the exact prior Context, both clear Spread/session state, and subsequent submissions reuse the existing asynchronous contract with a new UUID.
- Task 4 complete: both intended generations succeeded and accounting advanced exactly `+2 / +0.06`; Tony selected localStorage draft persistence, and a zero-spend live replay then proved Tweak's exact Context survives reload without resuming the completed Session.
- LocalStorage scope: only the redraw Context draft is stored; it is cleared by Fresh, sign-out/auth loss, or the next Orientation submission. Spread remains intentionally unselected, and no API/DynamoDB contract was added.
- Task 5 complete: every Definition of Done gate passed, the source diff is isolated and pushed, and the story is ready for review.

### File List

- `_bmad-output/implementation-artifacts/3-4-redraw-from-the-results-screen.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/App.jsx`
- `src/AppAuth.test.jsx`
- `src/components/OrientationGuideResults.jsx`
- `src/components/OrientationGuideResults.test.jsx`
- `_bmad-output/implementation-artifacts/3-3-view-the-orientation-guide-results-screen.md` (pre-existing Story 3.8 landing)
- `_bmad-output/implementation-artifacts/3-8-make-orientation-guide-generation-durable-and-asynchronous.md` (pre-existing Story 3.8 landing)
- `_bmad-output/implementation-artifacts/deferred-work.md` (pre-existing Story 3.8 landing)
- `_bmad-output/planning-artifacts/architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md` (pre-existing Story 3.8 landing)
- `_bmad-output/planning-artifacts/epics.md` (pre-existing Story 3.8 landing)
- `_bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/prd.md` (pre-existing Story 3.8 landing)
- `_bmad-output/planning-artifacts/ux-designs/ux-tarot-spa-2026-07-09/EXPERIENCE.md` (pre-existing Story 3.8 landing)
- `_bmad-output/project-context.md` (pre-existing Story 3.8 landing)
- `amplify/backend.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-alert/handler.test.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-alert/handler.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-alert/resource.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-guide/handler.test.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-guide/handler.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-guide/resource.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-reconciler/handler.test.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-reconciler/handler.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/orientation-reconciler/resource.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/start-orientation-guide/handler.test.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/start-orientation-guide/handler.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/usage-counter/reservation.test.ts` (pre-existing Story 3.8 landing)
- `amplify/functions/usage-counter/reservation.ts` (pre-existing Story 3.8 landing)
- `docs/orientation-guide-reconciliation.md` (pre-existing Story 3.8 landing)
- `src/components/ContextEntry.jsx` (pre-existing Story 3.8 landing)
- `src/components/ContextEntry.test.jsx` (pre-existing Story 3.8 landing)
- `src/utils/orientation.js` (pre-existing Story 3.8 landing)
- `src/utils/orientation.test.js` (pre-existing Story 3.8 landing)

## Change Log

- 2026-07-23: Story created via create-story workflow (ultimate context engine analysis) — status ready-for-dev.
- 2026-07-24: Implemented and live-verified both Results redraw actions, added localStorage-backed Tweak Context reload persistence per Tony's decision, passed all closeout gates, pushed the isolated source commit, and moved the story to review.
- 2026-07-24: Code review completed (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Core implementation confirmed clean across all three layers. Tony ratified the redraw-draft lifecycle as accept-and-document; three patches applied (normative-doc supersession + project-context amendment, tautological-assertion fix, baseline_commit correction); one low UX-intersection finding deferred to deferred-work.md. 229/229 tests and lint green post-patch. Status → done.
- 2026-07-25: Second full code review (fresh three-layer run over the c27971e → working-tree diff, prior round's patches included). No high-severity code defects; 1 decision (Tony: fix (f), document (e)), 13 patches applied, 3 findings dismissed as noise. Headline patch: the stranded 2026-07-24 review round was committed as `484350c` before any second-round change. Code fixes: recovery-restore now clears the draft, fallback-clear on failed Tweak store, duplicate `setOrientContext('')` removed, dead helper return removed, no-op callback defaults added. Test fixes: vacuous Fresh-clear assertion seeded, auth-loss draft wipe pinned, denied-storage degraded reload pinned, bitmask-safe divider/order assertions. 230/230 tests, lint, typecheck, build green. Status remains done.
