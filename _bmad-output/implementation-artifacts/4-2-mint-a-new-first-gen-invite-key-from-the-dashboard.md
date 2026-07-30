---
baseline_commit: fc27a30
---

# Story 4.2: Mint a new First-Gen Invite Key from the dashboard

Status: ready-for-dev

## Story

As Tony,
I want to mint a new First-Gen Invite Key on demand,
So that I can invite a friend directly or grant an approved access request.

**Second story of Epic 4 — the Admin Dashboard and its group-gating already exist (Story 4.1, done, `ad1fe77`/`fc27a30`).** This story adds one new capability inside that existing dashboard: a "Mint Key" control. It does **not** create a new Lambda, a new admin surface, or any new authorization mechanism — it reuses 4.1's `Admin` Cognito group and `AdminDashboard.jsx` shell, and reuses Story 1.2's existing `invite-key-mint` Lambda (extending it with a second, differently-authorized mutation) rather than duplicating its code generation/DynamoDB logic.

## Acceptance Criteria

*(Verbatim from epics.md#Story-4.2)*

1. **Given** Tony is on the Admin Dashboard, **when** he triggers "Mint Key", **then** a new, valid, unredeemed First-Gen InviteKey is created, with no generation/eligibility restriction — a separate admin-only path from Story 1.2's onward-key mechanism (AD-17)
2. **Given** a non-admin Account, **when** they attempt to call the mint mutation directly, **then** it's rejected server-side via the admin-group check (AD-9)
3. **Given** key minting fails for any reason, **when** the failure occurs, **then** Tony sees a clear inline error and the action remains available to retry

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. No new setup. This story adds no new secret, no new third-party API, no new IAM surface beyond a second AppSync operation on an already-provisioned Lambda. Your `Admin` group membership from Story 4.1 already covers this story's live verification.
2. Valid AWS session for `npx ampx sandbox` deploy and live verification — same as every prior backend story.

## Contract values (frozen — the dev agent implements exactly these)

| Item | Value |
|---|---|
| **Critical architectural instruction — read before writing any code** | AD-17 explicitly directs: *"Tony's own direct admin-mint path (FR-3) is a separate mutation on the same `invite-key-mint` Lambda, gated only by AD-9's admin-group check — no `generation`/`onwardKeyGenerated` condition applies to it."* This means: **do not create a new Lambda function.** Add a second GraphQL mutation in `amplify/data/resource.ts` that points at the *same* `inviteKeyMint` function reference already imported there, with its own `allow.group('Admin')` authorization rule (independent from `mintOnwardKey`'s `allow.authenticated()` rule). AppSync enforces each operation's own authorization rule before invoking the Lambda — exactly the same mechanism 4.1 already established for `adminMetrics` (a non-admin's call never reaches the handler at all; the handler needs no internal re-check for AC 2). Verified: multiple `a.mutation()`/`a.query()` entries can each independently reference the same `ConstructFactory` via `a.handler.function(inviteKeyMint)` — nothing in `@aws-amplify/data-schema`'s types restricts this, and it's the same reuse pattern this story requires. Traced further: `node_modules/@aws-amplify/backend-function/lib/factory.js`'s `FunctionFactory.getInstance` memoizes on the factory instance, and the backend's `constructContainer.getOrCompute(this.generator)` further memoizes by that generator's identity — so referencing the same module-level `inviteKeyMint` export twice is guaranteed to resolve to one physical Lambda, not two, by construction (not merely "nothing says it can't"). |
| New AppSync mutation | `amplify/data/resource.ts`: add `adminMintInviteKey: a.mutation().returns(a.string()).authorization((allow) => [allow.group('Admin')]).handler(a.handler.function(inviteKeyMint))`. No new import needed — `inviteKeyMint` is already imported at the top of this file for `mintOnwardKey`. Name chosen for symmetry with 4.1's `adminMetrics` (both are the codebase's only two `Admin`-group-gated operations) and to avoid confusion with the existing `mintOnwardKey` field. |
| `amplify/backend.ts` — **no change needed** | `inviteKeyMintLambda` already has `accountTable.grantWriteData(...)` and `inviteKeyTable.grantWriteData(...)` (from Story 1.2) — both grants the new admin path needs, since it only writes a new InviteKey item. Do not add a new Lambda declaration, new grants, or new environment variables. Confirm this by reading the current `backend.ts` — if you find yourself about to add anything there for this story, stop and re-read this row. |
| Handler branching (`amplify/functions/invite-key-mint/handler.ts`) | AppSync's Lambda-resolver event carries `info.fieldName` — the exact GraphQL field name being resolved (confirmed against `@types/aws-lambda`'s `AppSyncResolverEvent` type: `info: { fieldName: string, ... }`; this codebase's other custom-operation handlers already rely on the same event's `.arguments`/`.identity` fields, so `.info.fieldName` is equally available). Extend the existing `MintOnwardKeyEvent` type to `type MintInviteKeyEvent = { identity?: { sub?: string } | null; info?: { fieldName?: string } }`. Branch **at the top of the returned handler function**, before any existing identity/table-config guard runs: `if (event.info?.fieldName === 'adminMintInviteKey') { return mintAdminKey(deps); }` then fall through unconditionally into the existing, completely unchanged onward-key body (identity check → table-config check → `TransactWriteCommand` → `isAccountConditionalFailure` catch). **Any value other than the exact string `'adminMintInviteKey'`, including `undefined`**, takes the onward path — this is a strict additive change; no existing test needs to change, because `undefined !== 'adminMintInviteKey'` falls through to today's exact behavior. Get this comparison direction right: the admin branch is the new, narrow, explicitly-named `if`; the onward path is the pre-existing default fall-through, not a new `else` you write from scratch — swapping which path is "default" would silently invert the two mutations' behavior with no authorization-layer safety net to catch it (AppSync's per-field auth only gates *which caller* can invoke a field, not *which code path* the shared handler takes once invoked). |
| New admin-mint path logic | No `identity`/`accountId` check, no Account table read or write at all (AC 1: "no generation/eligibility restriction"). Generate a code with the existing `deps.generateCode()` (same `generateInviteCode`, same alphabet/format — do not invent a second code generator). Write it with a plain `PutCommand` (not the onward path's `TransactWriteCommand` — there's no second table to touch): `{ TableName: deps.inviteKeyTableName, Item: { id: code, status: 'unredeemed', generation: 'FirstGen', createdAt: timestamp, updatedAt: timestamp }, ConditionExpression: 'attribute_not_exists(id)' }`. Return the code (`a.string()`, matching `mintOnwardKey`'s exact return shape). On `ConditionalCheckFailedException` (astronomically unlikely code collision — 31-character alphabet × 12 bytes), let it propagate as a generic thrown error; do not add a generation-collision retry loop — AC 3's "remains available to retry" is already satisfied by the user clicking "Mint Key" again, which generates a fresh random code. Do not log the generated code anywhere (matches the existing onward-key path's silence and project-context.md's logging-restraint convention). |
| `PutCommand` import | `amplify/functions/invite-key-mint/handler.ts` currently imports `TransactWriteCommand` from `@aws-sdk/lib-dynamodb` only — add `PutCommand` to that same import line. |
| Frontend util (`src/utils/inviteKeys.js`) | Add `export async function adminMintInviteKey() { const client = generateClient(); const { data, errors } = await client.mutations.adminMintInviteKey(); if (errors?.length) throw new Error(errors[0].message); if (!data) throw new Error('Invite Key was not returned'); return data; }` — byte-identical shape to the existing `mintOnwardKey` in the same file (same file, do not create a new util module). |
| New frontend component (`src/components/MintInviteKey.jsx`) | **Deliberately not a copy of `GrantInviteKey.jsx`'s one-shot hide-button-after-success behavior** — see Dev Notes scope decision 1 for why. Props: `{ mintFn = adminMintInviteKey }` — no `account` prop (no eligibility state exists to check), no `refreshAccountFn` (no "not eligible" race to recover from, since there's no eligibility at all). State: `code` (last-minted code, `''` initially), `busy`, `error`, `copied`, a `submitting` ref guard (mirrors `GrantInviteKey`'s double-submit guard). The "Mint Key" button (exact label: "Mint Key" per EXPERIENCE.md's own naming — not "Grant Invite Key" wording) stays **visible and enabled after a successful mint** (unlike `GrantInviteKey`, where the button disappears once used) — Tony can mint as many First-Gen keys as he wants, back-to-back, per PRD FR-3 ("no ceiling on how many"). A successful mint replaces any previously displayed code (no history list — out of scope, see below) and shows it with the same monospace-chip + Copy-button treatment `GrantInviteKey.jsx` already uses inline (`select-all` `<code>`, a `Copy`/`Copied` button, `role="status"` `aria-live="polite"` copy announcement) — reuse that exact JSX shape, adapted to this component's own state names; do not extract a new shared "Key/Code Display" component for two call sites (premature abstraction for this solo-owned codebase — flag if you disagree, don't silently build one). On mint failure: `role="alert"` with copy "We couldn't mint an Invite Key. Please try again." (mirrors `GrantInviteKey`'s error-copy register), button re-enabled, action stays retryable (AC 3) — no "not eligible" branch exists here (that's onward-key-specific; do not port it). On clipboard failure specifically, reuse `GrantInviteKey.jsx`'s exact existing copy verbatim: "Copy failed. Select the key and copy it manually." (`GrantInviteKey.jsx:57`) — don't invent new wording for the same failure mode. |
| `AdminDashboard.jsx` wiring | Import and render `<MintInviteKey />` (no props needed from `AdminDashboard` itself) inside the `ready` state render branch — place it prominently near the top (e.g., directly under the `<h1>Admin Dashboard</h1>` heading, above the `<dl>` metrics list), matching EXPERIENCE.md's framing ("Plain metrics list/table... + one 'Mint Key' button"). **No new `AdminDashboard` props, no new `App.jsx` change** — `AdminDashboard` is already only ever rendered for `isAdminUser === true` (Story 4.1's existing gate), so `MintInviteKey` is automatically hidden from non-admins with zero new client-side gating logic. |

## Explicitly out of scope (do not build)

- **Any change to `mintOnwardKey`, `GrantInviteKey.jsx`, or Story 1.2's onward-key eligibility mechanism.** This story adds a sibling mutation on the same Lambda; the existing onward-key path's behavior, tests, and UI are untouched.
- **A shared "Key/Code Display" component extraction.** UX-DR5 names this only for the Grant Invite Key action; only two call sites would exist after this story (`GrantInviteKey.jsx`, `MintInviteKey.jsx`) — reuse the visual style inline in both, don't force a shared component for two users.
- **A history list of previously minted keys, or any audit trail linking a mint to a specific FR-5 access request.** PRD FR-12's own Notes section explicitly defers this ("`[ASSUMPTION]` No formal audit trail... Tony tracks this informally... Revisit if request volume grows"). One most-recent-code display, replaced on each mint, is sufficient.
- **A code-collision retry loop.** See the "New admin-mint path logic" contract row — astronomically unlikely, and the existing onward-key path has no such loop either.
- **Any new Lambda, new `backend.ts` wiring, new IAM grant, or new environment variable.** The existing `invite-key-mint` Lambda and its Story-1.2 grants already cover everything this story needs.
- **A dedicated handler-level admin-group re-check inside `invite-key-mint/handler.ts`.** AppSync's own `allow.group('Admin')` on the new mutation field is the enforcement point (same precedent as 4.1's `adminMetrics`); duplicating that check inside the shared handler would be redundant and wouldn't know which GraphQL field's rule to re-verify against anyway.
- **Any new e2e Playwright spec or new e2e assertion.** AC 2's non-admin rejection is verified live (Task 6) via a direct unauthorized-mutation attempt, the same one-off verification style 4.1 used for `adminMetrics` — not a new checked-in browser test.

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight** (AC: none — gate)
  - [x] Confirm `git log -1` is `fc27a30` and the tree is clean.
  - [x] Baseline gates green: `npm test` (293/293 expected — confirm the real number), `npm run lint`, `npm run typecheck`, `npm run build`.
  - [x] Confirm sandbox reachable and Tony's `Admin` group membership from Story 4.1 is still intact (`aws cognito-idp admin-list-groups-for-user`, or simply confirm the Admin Dashboard button still appears for Tony's account via `npm run dev`).
- [x] **Task 1: `adminMintInviteKey` AppSync mutation** (AC: 1, 2)
  - [x] `amplify/data/resource.ts`: add the `adminMintInviteKey` mutation per the contract table. No import change (`inviteKeyMint` already imported). No other schema/model change.
- [x] **Task 2: Handler branching + admin-mint path** (AC: 1, 3)
  - [x] `amplify/functions/invite-key-mint/handler.ts`: add `PutCommand` to the existing `@aws-sdk/lib-dynamodb` import, extend the event type to include `info?.fieldName`, branch on `event.info?.fieldName === 'adminMintInviteKey'`, implement the new path per the contract table's exact shape. The existing onward-key path (identity check, `TransactWriteCommand`, `isAccountConditionalFailure`) is otherwise untouched.
  - [x] `amplify/functions/invite-key-mint/handler.test.ts`: preserve every existing test unmodified (they never set `info`, so they must keep exercising the onward path — this is the regression check that the branch default is correct). Add new tests: admin path with no `identity` at all succeeds and returns the generated code (proves no accountId dependency); admin path's `PutCommand` asserted with the exact `TableName`/`Item` (`generation: 'FirstGen'`, `status: 'unredeemed'`)/`ConditionExpression` values, not a loose partial match; a `ConditionalCheckFailedException` on the admin `PutCommand` propagates as a thrown error (not silently swallowed, unlike the onward path's `not eligible` translation — these are different failure semantics, don't conflate them); explicitly assert that supplying `info: { fieldName: 'mintOnwardKey' }` (the real value AppSync will send in production) still executes the onward path identically to omitting `info` entirely.
- [x] **Task 3: Frontend util** (AC: 1, 3)
  - [x] `src/utils/inviteKeys.js`: add `adminMintInviteKey()` per the contract table.
  - [x] `src/utils/inviteKeys.test.js` (new file — no test file exists yet for this module; only cover the new function, not the pre-existing untested `checkInviteKey`/`mintOnwardKey`, which is a pre-existing gap out of this story's scope): success returns the code; `errors` array present throws with the GraphQL error message; `data` falsy throws `'Invite Key was not returned'`.
- [x] **Task 4: `MintInviteKey` component** (AC: 1, 3)
  - [x] `src/components/MintInviteKey.jsx` per the contract table.
  - [x] `src/components/MintInviteKey.test.jsx`: renders the "Mint Key" button; submits only once across rapid repeated clicks (mirror `GrantInviteKey.test.jsx`'s identical test); shows the code + Copy button after a successful mint, **and the "Mint Key" button remains visible and enabled** (the key behavioral difference from `GrantInviteKey` — assert this explicitly, it's the test that would catch someone copy-pasting the wrong component); minting a second time replaces the previously displayed code; shows a retryable `role="alert"` on failure with the exact copy from the contract table; clipboard failure shows a copy-manually error without hiding the code (mirror `GrantInviteKey.test.jsx`'s clipboard-failure test).
- [x] **Task 5: Wire into `AdminDashboard.jsx`** (AC: 1, 3, 4-from-4.1-still-holds)
  - [x] Import and render `<MintInviteKey />` per the contract table's placement guidance.
  - [x] `src/components/AdminDashboard.test.jsx`: add one assertion that the "Mint Key" button renders in the `ready` state (don't duplicate `MintInviteKey.test.jsx`'s own thorough coverage here — just prove it's actually wired in).
- [x] **Task 6: Deploy + live verification** (AC: 1, 2, 3)
  - [x] `npx ampx sandbox --once`. Confirm the new `adminMintInviteKey` mutation and unchanged `mintOnwardKey`/`invite-key-mint` Lambda deployed cleanly.
  - [x] As Tony (admin): `npm run dev`, open the Admin Dashboard, click "Mint Key" — confirm a new code appears, Copy works, and clicking "Mint Key" again produces a *different* new code without needing to leave the dashboard (AC 1, proving the no-eligibility-ceiling behavior for real). Confirm the new InviteKey items are `status: unredeemed`, `generation: FirstGen` (AWS console or a throwaway read).
  - [x] Defense-in-depth (AC 2): while signed in as the shared non-admin `TAROT_E2E_*` test account, attempt `client.mutations.adminMintInviteKey()` directly (browser console or a throwaway script) and confirm AppSync rejects it as unauthorized — mirrors 4.1's identical `adminMetrics` verification.
  - [x] Spot-check AC 3: temporarily break connectivity or otherwise force one failure (e.g. throttle/offline the tab briefly) and confirm the inline error appears with the button still clickable, then let a normal mint succeed on retry.
- [ ] **Task 7: Close out (Definition of Done)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e` (existing specs only — no new e2e spec; confirm nothing regressed, including the admin/non-admin authenticated flows Story 4.1 added).
  - [x] Sweep the diff and this story file for credentials — no new secrets are introduced by this story.
  - [x] Update `sprint-status.yaml` (`4-2-mint-a-new-first-gen-invite-key-from-the-dashboard` → `review`).
  - [ ] Commit and push to `main`. Paste `git status --short` (expect empty) and `git log -1` output directly in this story's Dev Agent Record — a prose "committed and pushed" claim alone is not sufficient evidence (standing Epic 3 retro action item; Story 4.1's own close-out required a correction pass to satisfy this exact gate — get it right the first time here).

### Review Findings

*(populated during code review)*

## Dev Notes

### Scope decisions (made at story creation — implement as written, flag disagreement rather than silently deviating)

1. **`MintInviteKey` is a repeatable action, not a one-shot like `GrantInviteKey`.** `GrantInviteKey.jsx` permanently hides its button once a key is granted, because Story 1.2's onward-key mechanism is a true one-time eligibility flip (`onwardKeyGenerated: true` forever). Story 4.2's admin mint has explicitly "no generation/eligibility restriction" (AC 1) and PRD FR-3 says Tony has "no ceiling on how many" First-Gen keys he can mint. Copying `GrantInviteKey`'s hide-after-success behavior into `MintInviteKey` would be a functional regression disguised as code reuse — it would make Tony think he can only ever mint one key per dashboard visit. Keep the button live; replace the displayed code on each successful mint.
2. **One Lambda, two independently-authorized GraphQL mutations.** This is the load-bearing architectural instruction from AD-17 (quoted verbatim in the contract table) — do not build a second Lambda "to be safe" or "for separation of concerns." AD-4's thin-Lambda-boundary rule is satisfied because this remains one Lambda with one clear responsibility (mint an InviteKey); the two mutations differ only in which write path they take and which AppSync-level authorization rule gates them, which is exactly the kind of variation a single thin Lambda is allowed to have (compare: `orientation-guide`'s single worker already branches internally by durable step).
3. **No shared "Key/Code Display" component extraction.** Two call sites (`GrantInviteKey.jsx`, `MintInviteKey.jsx`) sharing a few lines of monospace-chip JSX doesn't clear the bar for a new abstraction in this solo-owned codebase (see `project-context.md`'s "no rigid constraints"/anti-premature-abstraction guidance, and this project's own established preference — recorded from prior stories — for duplication over cross-component abstraction at this scale). If a third mint-like surface is ever added, that's the point to reconsider.

### What already exists — reuse, don't rebuild

- **`amplify/functions/invite-key-mint/{resource.ts,handler.ts,handler.test.ts}`** — the Lambda this story extends, not replaces. `generateInviteCode`/`CODE_ALPHABET`, the `HandlerDependencies` DI shape, and `defaultDependencies` are all reused verbatim.
- **`amplify/backend.ts`'s existing `inviteKeyMintLambda` grants** — `accountTable.grantWriteData`/`inviteKeyTable.grantWriteData`, `ACCOUNT_TABLE_NAME`/`INVITE_KEY_TABLE_NAME` env vars — already sufficient, confirmed by direct inspection at story-creation time (2026-07-28).
- **`src/components/GrantInviteKey.jsx`** — the visual/interaction pattern (`<code>` chip, Copy button, `aria-live` announcement, `submitting` ref guard, busy-disabled button styling) `MintInviteKey.jsx` adapts — but explicitly *not* its one-shot hide-after-success semantics (see scope decision 1).
- **`src/utils/inviteKeys.js`** — already the single co-location point for all invite-key-related client utils (`checkInviteKey`, `mintOnwardKey`); `adminMintInviteKey` joins it in the same file, not a new module.
- **`src/components/AdminDashboard.jsx`** — Story 4.1's dashboard shell (loading/error/ready states, `role="status"`/`role="alert"` conventions, `buttonClass` constant) — this story adds one line of new JSX to the existing `ready` branch, nothing else.
- **4.1's `isAdmin`/`showAdminDashboard`/`AccountBar` wiring in `App.jsx`** — completely untouched; `AdminDashboard` being admin-only-rendered already gates everything inside it, including the new `MintInviteKey`.

### Architecture compliance checklist (the ADs/NFRs that bind this story)

- **AD-17**: this story's entire shape *is* AD-17's explicit instruction — one Lambda, a new admin-mint mutation with no `generation`/`onwardKeyGenerated` condition, gated only by AD-9's admin-group check.
- **AD-9**: the new mutation's `allow.group('Admin')` rule is the enforcement point; no owner-rule relaxation anywhere.
- **AD-4**: no new abstraction layer; the shared Lambda gains one more internal branch, not a service tier.
- **No new Amplify Data model or schema field** — `InviteKey`'s existing fields (`status`, `generation`, `redeemedBy`) already cover a `FirstGen`/`unredeemed` key; nothing in AD-8's fixed model set changes.

### Previous story intelligence (4.1)

- **4.1 is the direct predecessor and establishes every pattern this story reuses**: the `Admin` Cognito group, `AdminDashboard.jsx`'s state-machine shape, the "AppSync enforces the group gate before the Lambda runs, so the handler needs no internal re-check" precedent (now reused for the *second* `Admin`-gated operation in this codebase), and the live defense-in-depth verification style (Task 6 here mirrors 4.1's Task 9 almost exactly).
- **4.1's actual process gap — do not repeat it.** Story 4.1 was implemented, tested, and code-reviewed correctly, but its Dev Agent Record originally claimed "committed and pushed" completion notes while the entire implementation sat uncommitted in the working tree for a full day — its own Task 10 close-out later found and corrected this (per the standing Epic 3 retro action item that already required real git evidence, not a prose claim). Task 7 of *this* story exists to satisfy that same standing requirement the first time — paste real `git status --short`/`git log -1` output, don't just narrate it.
- **4.1's review findings worth carrying forward**: re-evaluate admin state on auth-token refresh (already handled generically by `App.jsx`'s existing `authRefreshRevision`-keyed effect — nothing new needed here since this story adds no new admin-detection logic), and keep any loading-state UI from trapping the user without a way back (this story's `MintInviteKey` has no loading-blocks-navigation concern since it lives inside the already-loaded `ready` dashboard state, not a separate loading gate).

### Git intelligence

Recent history: `fc27a30` (docs: record story 4.1 git evidence) and `ad1fe77` (feat: add admin dashboard usage & spend metrics) are Story 4.1's implementation, the first story to combine backend + frontend surface area in one change. This story is smaller and narrower — one new mutation on an *existing* Lambda, one new small component composed into an *existing* dashboard — expect a smaller diff than 4.1's. Commit-message prefixes in use: `feat:`, `fix:`, `test:`, `docs:`, `chore:`; `feat:` fits this story's shape.

### Project Structure Notes

- New: `src/components/MintInviteKey.jsx`, `src/components/MintInviteKey.test.jsx`, `src/utils/inviteKeys.test.js`.
- Modified: `amplify/data/resource.ts`, `amplify/functions/invite-key-mint/handler.ts`, `amplify/functions/invite-key-mint/handler.test.ts`, `src/utils/inviteKeys.js`, `src/components/AdminDashboard.jsx`, `src/components/AdminDashboard.test.jsx`.
- NOT touched: `amplify/backend.ts` (no new grants/env vars needed — see contract table), `amplify/auth/resource.ts`, `src/App.jsx`, `src/components/GrantInviteKey.jsx` (and its test file), any `Session`/`DailyUsage`/`MonthlySpend`/`Config`/`Account` schema field, `amplify/functions/admin-metrics/**`, any `e2e/**` file. If the diff grows beyond this list, stop and reconcile against this story before continuing.

### References

- [Source: epics.md#Story-4.2] — the 3 ACs verbatim; [#Epic-4] epic framing
- [Source: prd.md §4.5 FR-3, FR-12] — "no ceiling on how many" (FR-3), the admin-mint control requirement and its "no formal audit trail" accepted-scope note (FR-12)
- [Source: ARCHITECTURE-SPINE.md AD-17, AD-9, AD-4] — the binding one-Lambda/two-mutations instruction and its authorization/abstraction guardrails
- [Source: EXPERIENCE.md "Admin Metrics + Mint Key" row, "Key minting fails" row] — the "Mint Key" button naming and the clear-inline-error/retryable failure voice
- [Source: 4-1-view-usage-spend-metrics.md] — the `Admin` group/`AdminDashboard.jsx` precedent this story extends, and the git-evidence process gap this story's Task 7 explicitly closes
- [Source: amplify/functions/invite-key-mint/{resource.ts,handler.ts,handler.test.ts}] — the exact existing Lambda this story extends rather than replaces
- [Source: amplify/backend.ts] — confirms `inviteKeyMintLambda`'s existing grants already cover this story's needs (verified by direct inspection, 2026-07-28)
- [Source: src/components/GrantInviteKey.jsx, GrantInviteKey.test.jsx] — the visual/interaction pattern this story adapts (explicitly not its one-shot semantics)
- [Source: src/utils/inviteKeys.js] — the existing co-location file `adminMintInviteKey` joins
- [Source: node_modules/@aws-amplify/data-schema, @types/aws-lambda] — verified the same-Lambda-two-mutations pattern and the `info.fieldName` event field are both valid

## Dev Agent Record

### Agent Model Used

OpenAI Codex (GPT-5)

### Implementation Plan

- Follow Tasks 0-7 in story order using red-green-refactor for each code-bearing task.
- Reuse the existing `invite-key-mint` Lambda, add only the independently authorized admin mutation and narrow `info.fieldName` handler branch, and leave the onward path unchanged.
- Add the invite-key client utility and repeatable `MintInviteKey` UI, wire it into the existing dashboard, then validate through unit/component, deploy, live authorization/data, E2E, and closeout gates.

### Debug Log References

- Baseline `npm test` under the ambient Node 25.9 runtime exposed Node's invalid `--localstorage-file` behavior and 42 cascading jsdom `localStorage` failures. Re-running on the repository's established Node 24.9.0 runtime passed all 293 tests; no code change was required.
- Baseline tree contained only the untracked Story 4.2 artifact created by the prior story workflow; sprint tracking changed when this workflow marked the story in progress. No implementation file differed from `fc27a30`.
- First live admin mint exposed that Amplify Gen 2's generated Lambda request mapping places the operation name at top-level `event.fieldName`, while the story contract assumed standard `AppSyncResolverEvent.info.fieldName`. The admin call therefore fell through to the onward path. Task 2 was reopened to cover the generated payload shape while retaining compatibility with `info.fieldName`.
- The in-app browser runtime was unavailable, so live browser verification used the repository's installed Playwright runtime. The shared sandbox account was first verified as unauthorized, then temporarily granted `Admin` for the same group-claim UI path; a `finally` cleanup removed the group. Tony's own `Admin` membership was confirmed separately during Task 0.

### Completion Notes List

- Task 0: Verified baseline commit `fc27a30`; 293/293 tests, lint, typecheck, and build passed on Node 24.9.0. Confirmed an active AWS session and Tony's `Admin` Cognito group membership.
- Task 1: Added the `adminMintInviteKey` mutation with its independent `Admin` group authorization and the existing `inviteKeyMint` handler. The schema contract check failed before the change and passed afterward; typecheck and the 293-test regression suite passed.
- Task 2: Added the `adminMintInviteKey` event branch and FirstGen `PutCommand` path without identity or Account access. The handler accepts Amplify's generated top-level `fieldName` payload and the standard `info.fieldName` shape, always defaulting non-admin field names to the unchanged onward path. Added mutation-survivable tests for the exact item, no-identity behavior, collision propagation, and explicit/default onward routing; 305/305 tests and typecheck passed after the live-found payload correction.
- Task 3: Added the thin `adminMintInviteKey` client utility and focused success, GraphQL-error, and missing-data tests. The new tests failed before implementation and the full 299-test suite passed afterward.
- Task 4: Added a repeatable `MintInviteKey` component with synchronous double-submit protection, latest-code replacement, copy feedback, and exact retryable mint/clipboard errors. Six component tests failed before implementation and all 305 tests plus lint passed afterward.
- Task 5: Wired `MintInviteKey` into the existing Admin Dashboard ready state directly below the heading. The dashboard integration assertion failed before wiring and all 305 tests passed afterward.
- Task 6: Deployed the schema and corrected shared Lambda to the Amplify sandbox. Live verification proved non-admin rejection; Admin dashboard visibility; two different consecutive keys persisted as `unredeemed`/`FirstGen`; clipboard equality; exact inline offline error with enabled retry; and successful retry. The shared account's temporary Admin membership was removed, and the pre-fix misrouted SecondGen key/eligibility mutation was cleaned up.
- Task 7 validation: Final closeout passed 305/305 Vitest tests, ESLint, TypeScript typecheck, production build, and all 4 existing Playwright tests. Diff/credential sweeps were clean; only synthetic test key fixtures matched the invite-code pattern.

### File List

- _bmad-output/implementation-artifacts/4-2-mint-a-new-first-gen-invite-key-from-the-dashboard.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- amplify/data/resource.ts
- amplify/functions/invite-key-mint/handler.test.ts
- amplify/functions/invite-key-mint/handler.ts
- src/utils/inviteKeys.js
- src/utils/inviteKeys.test.js
- src/components/MintInviteKey.jsx
- src/components/MintInviteKey.test.jsx
- src/components/AdminDashboard.jsx
- src/components/AdminDashboard.test.jsx

## Change Log

- 2026-07-28: Story created via create-story workflow. Second story of Epic 4 — extends Story 4.1's Admin Dashboard and reuses Story 1.2's `invite-key-mint` Lambda per AD-17's explicit "same Lambda, separate mutation" instruction rather than building a new admin-mint Lambda. Verified the same-Lambda/two-differently-authorized-mutations pattern is valid against the installed `@aws-amplify/data-schema` types, and confirmed `amplify/backend.ts` needs zero changes (existing grants already suffice). Flagged a deliberate UX divergence from `GrantInviteKey.jsx`: `MintInviteKey` must stay a repeatable action (no ceiling on minting), not a one-shot. Status: ready-for-dev.
- 2026-07-28: Independent fresh-context review pass, re-deriving the story from epics.md/prd.md/ARCHITECTURE-SPINE.md/EXPERIENCE.md and verifying every falsifiable technical claim against the live repo (`handler.ts`'s exact current shape, `backend.ts`'s existing grants, `data/resource.ts`'s current schema, the `AppSyncResolverEvent.info.fieldName` type, and — traced further than the first pass — `@aws-amplify/backend-function`'s `FunctionFactory` memoization proving the shared-Lambda claim by construction, not just by absence of a restriction). Found one process defect: `sprint-status.yaml` was never actually flipped to `ready-for-dev` despite the story header claiming it — fixed. Also: softened an overstated causal claim in Dev Notes (4.1's uncommitted-work gap was closed by 4.1's own Task 10 close-out, not discovered by this story's creation); added an explicit branch-skeleton warning to the handler-branching contract row, since a reversed if/else would produce a severe bug invisible to AppSync's per-field authorization (which gates *who* can call each mutation, not *which code path* the shared handler takes); pinned the clipboard-failure copy verbatim instead of only-by-reference; cited the exact memoization source file for the shared-Lambda claim. Everything else — all AC/AD/PRD/UX quotes, every current-repo file-shape claim, the 293/293 baseline test count — checked out true. Status remains ready-for-dev.
