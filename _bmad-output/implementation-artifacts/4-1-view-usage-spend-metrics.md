---
baseline_commit: 6626f93
---

# Story 4.1: View usage & spend metrics

Status: done

## Story

As Tony,
I want to see usage and spend metrics for the whole app,
So that I can tell what's actually happening without digging through raw data.

**First story of Epic 4 — this is the first admin-anything in the codebase.** No Cognito admin group, no `admin-metrics` Lambda, no admin-gated AppSync operation, and no admin UI surface exist yet (confirmed by inspection: `amplify/auth/resource.ts` has no `groups`, `amplify/data/resource.ts` has no group-authorized operation, `amplify/functions/` has no `admin-metrics` directory). This story stands all of that up from zero. Stories 4.2–4.4 will reuse the group/gating pattern this story establishes — get the shape right.

## Acceptance Criteria

*(Verbatim from epics.md#Story-4.1 — this is the authoritative, most-recent version. It supersedes prd.md FR-11's metric list, which predates Story 3.5 and does not mention `groundednessScore`.)*

1. **Given** Tony's admin-flagged Account, **when** he opens the Admin Dashboard, **then** he sees users by generation, total `SUCCEEDED` Session count, Daily Orientation Limit hit-rate, aggregate spend-to-date against the FR10 ceiling, and average `groundednessScore` across scored Sessions (Story 3.5) — all computed by the `admin-metrics` Lambda (AD-18); `PENDING` and `FAILED` lifecycle records do not inflate delivered-Guide metrics
2. **Given** a non-admin Account, **when** they attempt to reach the Admin Dashboard, **then** the surface is hidden from their navigation entirely — not a visible-but-blocked screen
3. **Given** the metrics were last computed some time ago, **when** Tony views the dashboard, **then** a "last refreshed" timestamp is visibly shown as plain text
4. **Given** the dashboard renders, **when** Tony looks at it, **then** it's plain metrics/table only — no charts, no extra visual polish (UX-DR15)

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. **Confirm you already have your own Account in this system** (signed up via a redeemed Invite Key, using your real email — distinct from the shared `TAROT_E2E_EMAIL` test account, which must stay non-admin). If you don't have one yet, sign up before Task 9 (live verification) — there must be a real Cognito user to add to the new `Admin` group. Tell the dev agent the email address to grant.
2. Valid AWS session for `npx ampx sandbox` deploy and `aws cognito-idp`/CLI calls — same as every prior backend story. No new secret, no new third-party API, no new SES/Bedrock/Tavily setup.

## Contract values (frozen — the dev agent implements exactly these)

| Item | Value |
|---|---|
| Cognito group | `amplify/auth/resource.ts`: add `groups: ['Admin']` to `defineAuth({...})`. One group, matching AD-9's "Cognito group or custom claim" — no custom claim needed when Amplify's built-in group support already produces a `cognito:groups` ID-token claim. |
| New Lambda | `amplify/functions/admin-metrics/` (`resource.ts`, `handler.ts`, `handler.test.ts`). `defineFunction({ name: 'admin-metrics', resourceGroupName: 'data', timeoutSeconds: 15 })` — co-located with `data` (same nested stack) so it can `grantReadData()` directly, exactly like `usage-counter`/`budget-alert` — no SSM-parameter indirection needed (that workaround in `backend.ts` exists only for the `auth`-stack `postConfirmation` Lambda's cross-stack problem, which does not apply here). 15s covers five DynamoDB round-trips at friend-circle table sizes with margin under AppSync's 30s Lambda-resolver ceiling; the Amplify default (3s) is too tight for this handler — must be set explicitly. |
| New AppSync operation | `amplify/data/resource.ts`: `adminMetrics: a.query().returns(a.json()).authorization((allow) => [allow.group('Admin')]).handler(a.handler.function(adminMetrics))`. Import `{ adminMetrics }` from `../functions/admin-metrics/resource`. `allow.group('Admin')` is enforced by AppSync itself before the Lambda runs — a non-member's call never reaches the handler, so the handler needs no internal re-check (same relationship as `allow.authenticated()` + `usage-counter`). |
| Handler response shape (exact keys — the frontend util in this story parses these) | `{ generatedAt: string (ISO), usersByGeneration: { FirstGen: number, SecondGen: number }, succeededSessionCount: number, dailyLimitHitRate: number \| null, dailyUsageRecordCount: number, monthlySpend: { spentToDate: number, budget: number }, averageGroundednessScore: number \| null, scoredSessionCount: number }`. `dailyLimitHitRate`/`averageGroundednessScore` are `null` when their denominator is 0 (no DailyUsage records / no scored Sessions yet) — never divide by zero, never silently show 0 (0 would misleadingly read as "no one ever hits the limit" / "perfectly grounded"). Worked example: `{ "generatedAt": "2026-07-26T18:04:00.000Z", "usersByGeneration": { "FirstGen": 3, "SecondGen": 2 }, "succeededSessionCount": 42, "dailyLimitHitRate": 0.15, "dailyUsageRecordCount": 40, "monthlySpend": { "spentToDate": 4.32, "budget": 30 }, "averageGroundednessScore": 0.28, "scoredSessionCount": 38 }`. |
| Daily Orientation Limit hit-rate definition (not specified anywhere in prd.md/epics.md/ARCHITECTURE-SPINE.md — this story defines it) | `hitCount / totalDailyUsageRecords`, where `hitCount` = DailyUsage records with `count >= Config.dailyLimit` (the **current** Config value, not whatever limit was active the day each record was written — same "current snapshot governs presentation" precedent as `usage-counter`). Scope: **all-time**, across every DailyUsage record ever written, not a rolling window — no time-window UI exists to pick one, and adding one would be premature (no chart/trend surface per UX-DR15). A DailyUsage `count` can never exceed `dailyLimit` at write time (`reservation.ts`'s `ConditionExpression: attribute_not_exists(id) OR #count < :limit` blocks it), so "hit" is `count === dailyLimit` in practice — write the comparison as `>=` anyway for robustness against any future counting change. |
| **`groundednessScore` direction — read this before writing any averaging or display code** | Per Story 3.5 (`3-5-score-orientation-guide-groundedness-async.md` line 25): `groundednessScore = floaters / totalClaims`, where a floater is an *ungrounded* claim. **0.0 = fully grounded (best), 1.0 = fully abstract (worst) — the opposite of what the field name suggests.** Average it as-is (do not invert). Label it on the dashboard so Tony can't misread it, e.g. `Average groundedness (floater) score: 0.28 — lower is better (0 = fully grounded, 1 = fully abstract)`. This is a factual clarifier, not "personality" copy — still satisfies EXPERIENCE.md's "plain and numeric" Admin Dashboard voice rule. Only Sessions with `groundednessScore` present count toward the average and `scoredSessionCount` — a Session judged-but-`ORIENTATION_JUDGE_NO_CLAIMS`/unparseable (no score written) is excluded, not treated as 0. |
| Table reads — **three scans + two gets, five reads total** (matches the five `grantReadData` grants and five env vars in the `backend.ts` row below — do not go looking for a fourth scan target) | Scans: Account, Session, DailyUsage. Gets: Config (`readConfig`), MonthlySpend (current month). `amplify/functions/orientation-reconciler/handler.ts`'s `do { ScanCommand({ TableName, ExclusiveStartKey, ... }) } while (LastEvaluatedKey)` loop is the copy-from pagination pattern for all three scans. Run all five reads via `Promise.all` for latency, not sequentially. |
| Reserved-word gotcha | DynamoDB reserves the word `count` — the DailyUsage scan's `ProjectionExpression`/any `FilterExpression` touching that attribute **must** alias it via `ExpressionAttributeNames: { '#count': 'count' }`, exactly like `reservation.ts` already does. Forgetting this throws a validation error at runtime, not at build/typecheck time. |
| Status normalization reuse | Import `effectiveStatus` from `../usage-counter/reservation` (already cross-imported by `orientation-judge` — an established pattern, not a new coupling) instead of reimplementing the `status ?? 'SUCCEEDED'` legacy convention. Also reuse `readConfig` and `utcMonth` from the same module for the Config read and the current-month MonthlySpend key. |
| MonthlySpend / Config reads | `MonthlySpend.Key = { id: utcMonth(now) }` (current calendar month only — matches FR-10's "aggregate spend against the FR10 ceiling", not historical months). A `GetCommand` returning no `Item` means `spentToDate = 0` (matches `reservation.ts`'s `if_not_exists(#spent, :zero)` semantics — don't treat a missing record as an error). `Config.Key = { id: 'global' }` via `readConfig` (throws if missing — same as every other Lambda that reads Config; a missing Config item is a real deploy-order bug, not a state to handle gracefully here). |
| `backend.ts` wiring | Add `adminMetrics` to imports + `defineBackend({...})` (alongside the other functions). Declare `const adminMetricsLambda = backend.adminMetrics.resources.lambda;` alongside the existing per-function `const xLambda = ...` block. Grant read via `accountTable.grantReadData(adminMetricsLambda)`, `sessionTable.grantReadData(adminMetricsLambda)`, `dailyUsageTable.grantReadData(adminMetricsLambda)`, `monthlySpendTable.grantReadData(adminMetricsLambda)`, `configTable.grantReadData(adminMetricsLambda)` (all five tables already have local `const xTable = backend.data.resources.tables.X` declarations at the top of `backend.ts` — reuse them, don't redeclare). Add environment vars: `ACCOUNT_TABLE_NAME`, `SESSION_TABLE_NAME`, `DAILY_USAGE_TABLE_NAME`, `MONTHLY_SPEND_TABLE_NAME`, `CONFIG_TABLE_NAME` on `backend.adminMetrics`. **No WAF rate-limit rule needed** — unlike `checkInviteKey`/`requestAccess`/`startOrientationGuide` (all reachable with cheap/no auth), `adminMetrics` requires `Admin`-group Cognito auth, the same posture as `mintOnwardKey`/`getOrientationStatus`, neither of which has a WAF rule either. Do not add one. |
| One-time admin-grant script | `scripts/grant-admin.mjs`, same shape/style as `scripts/seed-invite-key.mjs` but reads `amplify_outputs.json`'s `auth.user_pool_id` locally (no SSM param needed — unlike the DynamoDB scripts, there's no cross-stack problem to solve, the User Pool id is already in the local Amplify outputs file after any `npx ampx sandbox`/deploy) and calls `AdminAddUserToGroupCommand` from `@aws-sdk/client-cognito-identity-provider` (already a project dependency — see `amplify/auth/post-confirmation/handler.ts`). `npm run grant-admin -- <email>`. Add the npm script alongside `seed-config`/`seed-invite-key` in `package.json`. |
| Frontend utils | `src/utils/adminAuth.js`: `export async function isAdmin() { ... }` — `fetchAuthSession()` from `aws-amplify/auth`, read `session.tokens?.idToken?.payload?.['cognito:groups']`, return `Array.isArray(groups) && groups.includes('Admin')`; any thrown/missing-session case returns `false` (fail closed, mirrors `getMyAccount`'s `?? null` and every other defensive read in this codebase). `src/utils/adminMetrics.js`: `export async function getAdminMetrics()` — `generateClient()`, `client.queries.adminMetrics()`, throw on `errors`, `typeof data === 'string' ? JSON.parse(data) : data` (the standard `a.json()` string-or-object guard already used by `getOrientationStatus`/`startOrientationGuide` — project-context.md calls this out as a required boundary guard, don't skip it). |
| Frontend component | `src/components/AdminDashboard.jsx`. Fetches on mount via `getAdminMetrics()` (accept it as a prop with that default, mirroring `GrantInviteKey.jsx`'s `refreshAccountFn = getMyAccount` injectable-prop pattern — **not** `AccountBar`, which has no such prop and calls `getMyAccount()` directly — for testability). States: `loading` (`role="status"`), `error` with a `Retry` button (copy `AccountBar`'s existing error+retry JSX shape at `src/App.jsx:733-747` almost verbatim), `ready` — a plain `<dl>`/`<table>` listing all 6 metrics (users by generation as `FirstGen: N, SecondGen: N`; `SUCCEEDED` Session count; hit-rate as a percentage with the raw `hitCount`-style denominator context if you want it, but a single percentage number is sufficient to satisfy AC 1 — don't over-build); spend-to-date as `$X.XX of $Y budget`; the groundedness line with the exact "lower is better" clarifier from the row above; the `generatedAt` timestamp rendered as plain readable text for AC 3 (`toLocaleString()` or similar — no relative-time library, none exists in this codebase). One `Back` button (`onBack` prop) returning to the normal authenticated flow. Zero `OrnamentalDivider` usage (DESIGN.md explicitly excludes the Admin Dashboard from that motif) and zero chart/graph library (AC 4, UX-DR15 — "ugly but functional"). Reuse existing dark-theme Tailwind classes verbatim (`bg-gray-950`, `text-gray-300`, `text-gray-400`, `role="alert"`/`role="status"` conventions) — no new tokens, no new component library. |
| `App.jsx` wiring | Add `isAdminUser` state (default `false`) and `showAdminDashboard` state (default `false`). On the existing `authState === 'authenticated'` transition (same effect that already fetches `getOrientationStatus`, or a sibling one), call `isAdmin()` and set `isAdminUser`. Reset both to `false` in `handleSignedOut` (alongside the existing reset block). Pass `isAdmin={isAdminUser}` and `onShowAdminDashboard={() => setShowAdminDashboard(true)}` into `<AccountBar>`. In the authenticated render switch (`src/App.jsx:636-668`), add `showAdminDashboard` as the **first** branch, above `guideResult`/`spreadKey`: `showAdminDashboard ? <AdminDashboard onBack={() => setShowAdminDashboard(false)} /> : guideResult ? (...) : ...`. `AccountBar` gains two new props with safe defaults (`isAdmin = false`, `onShowAdminDashboard = () => {}`) and renders one more button — `Admin Dashboard` — only when `isAdmin` is true, placed near the existing `Log Out` button, same button styling as the existing `Retry account` button. |

## Explicitly out of scope (do not build)

- **Mint Key button / any invite-key minting from the dashboard** — Story 4.2.
- **Editing `dailyLimit`/`monthlyBudget` from the dashboard** — Story 4.3. This story only *reads* Config.
- **Revoke Invite Key** — Story 4.4.
- **Any raw Context/Guide content viewer** — explicitly forbidden by AD-10; `admin-metrics` returns aggregates only, never a per-Session/per-Account record.
- **Charts, graphs, or any visual polish beyond plain text/table** — AC 4, UX-DR15.
- **A time-windowed or trend view of hit-rate/spend** (e.g. "this week" vs. "all time") — no UI exists to select a window and building one is unscoped speculative complexity; the frozen definition above is deliberately simple (all-time cumulative).
- **Multi-admin / role-based access** — out of scope per prd.md §7/§8.2/FR-11 and ARCHITECTURE-SPINE.md Deferred; exactly one group, `Admin`, exists.
- **A cron/scheduled recompute or cache of the metrics** — "at least daily-refreshed" (FR-11) is trivially satisfied by computing live on every dashboard load; do not build a cache, a scheduled Lambda, or a stored "last computed" record. The `generatedAt` timestamp in the response *is* "now" at query time.
- **A new e2e Playwright *spec file*, or any e2e coverage of the admin-visible path** — the shared `TAROT_E2E_*` account must remain non-admin (see Dev Notes scope decision 4), so there is no automatable admin-side e2e path in this story. (One assertion *is* added to the existing `e2e/authenticated.spec.js` to automate AC 2's non-admin/hidden-nav half — see Task 8 — but that's an addition to an existing file, not a new spec.)
- **Any change to `Session`, `DailyUsage`, `MonthlySpend`, or `Config` schemas** — this story is read-only against all of them; AD-8's fixed model set is untouched.

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight** (AC: none — gate)
  - [x] Confirm `git log -1` is `6626f93`. The tree has pre-existing uncommitted files from the Epic 3 retrospective (`epic-3-retro-2026-07-26.md`, and edits to `deferred-work.md`/`sprint-status.yaml`/the 3.7 story file) — **do not discard them**; if they're still uncommitted when you start, isolate and commit them separately first, same precedent as every prior story's Task 0.
  - [x] Baseline gates green: `npm test` (271/271 expected — confirm the real number), `npm run lint`, `npm run typecheck`, `npm run build`.
  - [x] Confirm sandbox reachable: `npx ampx sandbox` status or a fresh `npm run dev` login with the existing test account.
- [x] **Task 1: Cognito `Admin` group** (AC: 1, 2)
  - [x] `amplify/auth/resource.ts`: add `groups: ['Admin']` per the contract table. No other change to this file.
- [x] **Task 2: `admin-metrics` Lambda** (AC: 1)
  - [x] `amplify/functions/admin-metrics/resource.ts` per the contract table.
  - [x] `amplify/functions/admin-metrics/handler.ts`: DI shape matching the established handler pattern used by `usage-counter`/`orientation-judge`/`orientation-reconciler`/`budget-alert` (`HandlerDependencies` object, `createHandler(deps)`, default deps built from env vars + real SDK clients, `export const handler = createHandler()`) — `check-invite-key/handler.ts` is the one existing handler that doesn't follow this shape; don't copy that one. Implements: parallel `Promise.all` of (a) `readConfig`, (b) MonthlySpend `GetCommand` for `utcMonth(now)`, (c) full Account scan, (d) full Session scan, (e) full DailyUsage scan. Then: group Account items by `generation` into `{ FirstGen, SecondGen }` (default both to 0, don't assume both generations exist yet); filter Session items to `effectiveStatus(item) === 'SUCCEEDED'` for `succeededSessionCount`, and within that set, average `groundednessScore` over items where `typeof groundednessScore === 'number'` for `averageGroundednessScore`/`scoredSessionCount` (null-safe per the contract table); compute `dailyLimitHitRate`/`dailyUsageRecordCount` per the frozen hit-rate definition. Return the exact response shape from the contract table, stringified or not — `a.json()` accepts either (this codebase's existing custom queries return a plain object from the handler; the frontend guard handles both).
  - [x] `amplify/functions/admin-metrics/handler.test.ts`: DI-mocked `dynamo.send` covering at minimum — empty tables (all metrics come back 0/null, no throw); mixed FirstGen/SecondGen counts; `SUCCEEDED` vs `PENDING`/`FAILED`/legacy-no-status Sessions (only `SUCCEEDED`+legacy count toward `succeededSessionCount`, matching `effectiveStatus`); groundedness average excludes Sessions with no `groundednessScore` field even if `SUCCEEDED` (unscored, not zero); hit-rate math with a mix of `count < dailyLimit` and `count >= dailyLimit` DailyUsage records, pinned to an exact fraction; multi-page `Scan` (assert the `ExclusiveStartKey`/`LastEvaluatedKey` loop actually re-queries, not just single-page happy path); MonthlySpend record absent for the current month → `spentToDate: 0`; Config missing → propagates the `readConfig` throw (Lambda fails loudly, same as every other Config-reading Lambda). Assert the exact returned object shape, not just individual field spot-checks.
- [x] **Task 3: `adminMetrics` AppSync query** (AC: 1, 2)
  - [x] `amplify/data/resource.ts`: import `adminMetrics`, add the `adminMetrics` query per the contract table. No other schema/model change.
- [x] **Task 4: `amplify/backend.ts` wiring** (AC: 1)
  - [x] Add `adminMetrics` import + `defineBackend({...})` entry, `const adminMetricsLambda = ...` declaration, the five `grantReadData` calls, and the five environment variables — all per the contract table. No WAF change (contract table explains why).
- [x] **Task 5: One-time admin-grant script** (AC: 1)
  - [x] `scripts/grant-admin.mjs` per the contract table.
  - [x] `package.json`: add `"grant-admin": "node scripts/grant-admin.mjs"` alongside the existing `seed-*` scripts.
- [x] **Task 6: Frontend utils** (AC: 1, 2, 3)
  - [x] `src/utils/adminAuth.js` — `isAdmin()` per the contract table.
  - [x] `src/utils/adminMetrics.js` — `getAdminMetrics()` per the contract table.
- [x] **Task 7: `AdminDashboard` component** (AC: 1, 3, 4)
  - [x] `src/components/AdminDashboard.jsx` per the contract table.
  - [x] `src/components/AdminDashboard.test.jsx` — loading state renders `role="status"`; error state renders `role="alert"` + a working `Retry` button that re-fetches; ready state renders all 6 metrics from a fixture response including the "lower is better" groundedness clarifier text and the `generatedAt` timestamp text; `null` `dailyLimitHitRate`/`averageGroundednessScore` render a clear "no data yet" state, not `0%`/`0` (a null-vs-zero regression here would be a silent lie to Tony); `Back` button calls `onBack` exactly once.
- [x] **Task 8: Wire into `App.jsx`/`AccountBar`** (AC: 1, 2, 3, 4)
  - [x] `src/App.jsx` changes per the contract table: `isAdminUser`/`showAdminDashboard` state, the admin-check effect, `handleSignedOut` reset additions, the `showAdminDashboard` render branch (first, above `guideResult`), `AccountBar`'s two new props + conditional `Admin Dashboard` button.
  - [x] Tests (`src/AppAuth.test.jsx` or a new `src/AppAdmin.test.jsx` if that keeps files focused — match whichever grouping convention feels closest to the existing split): mock `fetchAuthSession` (extend the existing `vi.mock('aws-amplify/auth', ...)` block) — admin account (groups include `Admin`) sees the `Admin Dashboard` button and clicking it renders `AdminDashboard`; non-admin account (no groups, or groups without `Admin`) never renders the button, confirmed by `queryByRole('button', { name: 'Admin Dashboard' })` returning `null` — this is AC 2's actual test, not a visible-but-disabled button; sign-out clears `showAdminDashboard` back to the normal flow.
  - [x] `e2e/authenticated.spec.js`: add one assertion to the existing test (do not add a new `test(...)` block or new file) — confirm `page.getByRole('button', { name: 'Admin Dashboard' })` is not present for the shared `TAROT_E2E_*` account. **Race warning:** `isAdminUser` is set by an async `fetchAuthSession()` effect that starts `false` — placing this assertion too early would pass trivially (button absent because the check hasn't resolved yet, not because it correctly resolved to non-admin) and wouldn't actually catch a regression where the button later appears. Playwright's `expect(locator).not.toBeVisible()` does not wait out the async effect on its own (a not-yet-rendered element already satisfies "not visible," so the matcher returns immediately without retrying). Explicitly wait for the admin-check to have had a chance to settle first — e.g. `await page.waitForLoadState('networkidle')`, or wait on some other already-loaded, account-dependent UI signal — before asserting absence. Place the assertion after the existing test's full interaction sequence (not immediately after login) for the same reason.
- [x] **Task 9: Deploy + live verification** (AC: 1, 2, 3, 4)
  - [x] `npx ampx sandbox --once`. Confirm the `Admin` User Pool group exists (`aws cognito-idp list-groups --user-pool-id <id>` or the console) and the new Lambda/AppSync operation deployed cleanly.
  - [x] Run `npm run grant-admin -- <Tony's email>` (pre-dev prerequisite 1). Confirm membership: `aws cognito-idp admin-list-groups-for-user --user-pool-id <id> --username <email>` shows `Admin`.
  - [x] **Log out and back in as Tony's account** before checking the dashboard — Cognito bakes `cognito:groups` into the ID token at issuance; a token issued *before* the group grant will not show the claim until a fresh sign-in (or the next automatic refresh). This is a real gotcha, not paranoia — don't skip it and then wrongly conclude the gating code is broken.
  - [x] As Tony (now admin-flagged), `npm run dev`: confirm the `Admin Dashboard` button appears, clicking it shows all 6 metrics with plausible real numbers, a "last refreshed" timestamp, no charts, and a working `Back` button (AC 1, 3, 4).
  - [x] As the shared `TAROT_E2E_*` test account (non-admin): confirm the `Admin Dashboard` button is entirely absent from the account bar (AC 2).
  - [x] Defense-in-depth check: while signed in as the non-admin test account, attempt `client.queries.adminMetrics()` directly (browser console, or a throwaway script) and confirm AppSync rejects it as unauthorized — proves the group gate is real server-side enforcement, not merely a hidden button (AD-9).
- [ ] **Task 10: Close out (Definition of Done)**
  - [ ] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e` (one new assertion added to the existing `e2e/authenticated.spec.js` per Task 8 — no new spec file; confirm nothing else regressed).
  - [ ] Sweep the diff and this story file for credentials — the live-verification AWS CLI/Cognito commands use Tony's real email locally only, never committed.
  - [ ] `deferred-work.md`: record (a) the all-time (non-windowed) hit-rate scope decision, flagged for revisit if Tony ever wants a trend view; (b) that `admin-metrics` does unbounded full-table `Scan`s and should be revisited (e.g. GSIs, or a maintained counter) if/when table sizes grow past friend-circle scale; (c) resolve or update the existing `deferred-work.md` "Silent scored-rate watch" entry — this story is what it was waiting on, so use the live-verification numbers to sanity-check `scoredSessionCount` against `succeededSessionCount` isn't suspiciously low.
  - [ ] Update `sprint-status.yaml` (`4-1-view-usage-spend-metrics` → `review`).
  - [ ] Commit and push to `main`. Paste `git status --short` (expect empty) and `git log -1` output in the story record per the standing Epic 3 retro action item — a prose "committed and pushed" claim is not sufficient evidence.

### Review Findings

- [x] [Review][Patch] Re-evaluate Admin membership when auth tokens refresh so revoked users do not retain stale dashboard navigation and newly promoted users can gain it without an auth-state transition [src/App.jsx:229]
- [x] [Review][Patch] Keep Back navigation available while metrics are loading so a delayed request cannot trap the admin on the loading surface [src/components/AdminDashboard.jsx:32]
- [x] [Review][Patch] Correct lifecycle metadata: Epic 4 is marked done while Story 4.1 is still in progress and Stories 4.2–4.4 remain backlog [\_bmad-output/implementation-artifacts/sprint-status.yaml:80]

## Dev Notes

### Scope decisions (made at story creation — implement as written, flag disagreement rather than silently deviating)

1. **One Cognito group, `Admin`, no custom claim.** AD-9 offers "Cognito group or custom claim" as alternatives; a group is the lower-friction idiomatic Amplify Gen 2 mechanism (`defineAuth({ groups: [...] })` is first-class, ships a `cognito:groups` ID-token claim automatically) and needs no Lambda pre-token-generation trigger the way a custom claim would. No reason to pick the heavier option for a single admin.
2. **`admin-metrics` does live, uncached, on-demand computation — no cron, no stored snapshot.** FR-11 only requires "at least daily-refreshed"; computing fresh on every dashboard open trivially exceeds that and keeps this story simple (no EventBridge schedule, no second Lambda, no staleness-tracking record). Revisit only if table growth makes per-load `Scan` latency actually painful (see Task 10's deferred-work entry).
3. **Hit-rate and groundedness-average definitions are this story's own decision, not a spec quote** — neither prd.md, epics.md, nor ARCHITECTURE-SPINE.md defines the hit-rate formula precisely, and only Story 3.5's record (not this epic) explains the groundedness score's inverted direction. Both are pinned exactly in the Contract values table above specifically so no two implementers would compute different numbers. If Tony wants a different hit-rate definition after seeing real numbers, that's a fast follow-up, not a blocker for this story.
4. **The shared `TAROT_E2E_*` Playwright test account stays non-admin.** Every authenticated story since 3.1 has relied on that account being an ordinary user; granting it `Admin` would silently change what "authenticated E2E coverage" has meant for three epics and risks something in an automated test suite accidentally exercising admin-only capability against real data. Tony's own real account is the only one ever added to `Admin` (Task 9). The non-admin half of AC 2 is fully verified three ways: Vitest (Task 8), one added assertion in the existing `e2e/authenticated.spec.js` (Task 8 — automated, but not a *new* spec file, since that account can never exercise the admin-visible half), and live (Task 9).

### What already exists — reuse, don't rebuild

- **`amplify/functions/usage-counter/reservation.ts`** — `readConfig`, `utcMonth`, `effectiveStatus` are all reused as-is by the new handler (see contract table). This file is already cross-imported outside its own function directory (`orientation-judge` does it) — that's an established pattern here, not a new coupling to invent an excuse for.
- **`amplify/functions/orientation-reconciler/handler.ts`**'s `Scan` + `ExclusiveStartKey` pagination loop — the exact idiom to copy for all three table scans.
- **`amplify/functions/usage-counter/{resource.ts,handler.ts}`** and **`budget-alert/resource.ts`** — the `resourceGroupName: 'data'` + direct `grantReadData()` pattern (no SSM indirection) that `admin-metrics` follows.
- **`src/components/AccountBar`'s error+retry JSX** (`src/App.jsx:733-747`) — the loading/error/retry shape `AdminDashboard.jsx` copies.
- **`src/utils/orientation.js`'s `getOrientationStatus`** — the exact `client.queries.X()` + `errors` guard + string-or-object `JSON.parse` pattern `adminMetrics.js` copies.
- **`scripts/seed-invite-key.mjs`** — the CLI-script shape (`process.argv` parsing, clear usage error, one focused AWS SDK call) `grant-admin.mjs` copies, adapted to read `amplify_outputs.json` instead of an SSM parameter (no cross-stack problem here to justify SSM).
- **`amplify/auth/post-confirmation/handler.ts`** — confirms `@aws-sdk/client-cognito-identity-provider` is already an installed dependency; no `package.json` dependency change needed for `grant-admin.mjs`.

### Architecture compliance checklist (the ADs/NFRs that bind this story)

- **AD-9**: admin access gated by Cognito group (`allow.group('Admin')`), never by relaxing per-record ownership on Account/Session/DailyUsage — this story adds no owner-rule change anywhere. AD-9's literal text says MonthlySpend's "read access is admin-group-gated via Amplify Data auth" — this story satisfies that intent *indirectly*: MonthlySpend's own model authorization stays exactly as-is (`allow.authenticated().to([])`, no ops, per AD-18's preference for server-side aggregation over client model reads), and the admin-group gate lives on the `adminMetrics` **query** instead, with `admin-metrics` reading MonthlySpend via direct Lambda IAM grant. Architecturally consistent with AD-18, just a different mechanism than AD-9's wording literally names — don't "fix" this by adding a per-model admin-group auth rule to MonthlySpend that AD-18 doesn't call for.
- **AD-10**: `admin-metrics` returns aggregates only — verify the handler never returns a raw `context`/`guide` string or a per-Session/per-Account list, only the six summary fields.
- **AD-18**: aggregates computed server-side by a dedicated Lambda, not client-side list-query aggregation — this is the entire shape of Task 2/3.
- **NFR3**: this story *is* FR-11/NFR3's "primary observability surface," reachable by pull (unlike 3.6's push alert, which stays the one exception).
- **UX-DR15**: plain metrics/table, no charts, reusing existing Tailwind tokens as-is.
- **No new Amplify Data model or schema field** — `admin-metrics` reads five existing models; nothing in AD-8's fixed set changes.

### Previous story intelligence (3.5, 3.6, 3.7)

- **3.5 is load-bearing for the groundedness metric** — read its "Score semantics" Dev Notes row directly (quoted in the contract table above) before writing any averaging code. Getting the direction backwards here would make Tony read the exact opposite signal from every dashboard load.
- **3.6 is the closest prior "new Lambda + `backend.ts` wiring" story** — this story's Contract-values-table structure, Task 0 pre-flight discipline, and Task 10 close-out discipline directly follow its shape (down to the "paste `git status`/`git log` evidence" requirement recorded in the Epic 3 retro action items).
- **3.7's process notes still apply**: isolate pre-existing dirty-tree work rather than discarding it (Task 0 — this story starts with a genuinely dirty tree from the Epic 3 retrospective, not a hypothetical); outcome-phrased verification, not "the function returned successfully."
- **The Epic 3 retrospective (`epic-3-retro-2026-07-26.md`, uncommitted at this story's creation) opened action items directly relevant here**: "Add finite/positive/range validation to `dailyLimit`/`monthlyBudget` before Story 4.3" (not this story — 4.3 owns editing) and "Reconcile Config's live `monthlyBudget` with the CDK-synth-time AWS Budget ceiling constant" (also 4.3-scoped, already tracked in `deferred-work.md`). Neither blocks 4.1, which only *reads* Config.

### Git intelligence

Recent history (`6626f93` back through `4fcd79c`) is Story 3.7 (test-only) and Story 3.6 (new `budget-alert` Lambda + `backend.ts` wiring, `amplify/**`-only). This story is the first to combine *both* a new backend Lambda **and** new frontend surface area in one story — expect a larger, two-sided diff than either predecessor. Commit-message prefixes in use: `feat:`, `fix:`, `test:`, `docs:`, `chore:`; `feat:` fits this story's shape (new capability spanning backend + frontend).

### Project Structure Notes

- New: `amplify/functions/admin-metrics/{resource.ts,handler.ts,handler.test.ts}`, `scripts/grant-admin.mjs`, `src/utils/adminAuth.js`, `src/utils/adminMetrics.js`, `src/components/AdminDashboard.jsx`, `src/components/AdminDashboard.test.jsx`.
- Modified: `amplify/auth/resource.ts`, `amplify/data/resource.ts`, `amplify/backend.ts`, `package.json`, `src/App.jsx`, `src/AppAuth.test.jsx` (or a new sibling test file — see Task 8), `e2e/authenticated.spec.js` (one assertion added, see Task 8 — this is the only `e2e/**` change).
- NOT touched: `Session`/`DailyUsage`/`MonthlySpend`/`Config`/`Account`/`InviteKey` schema fields, any existing Lambda's `handler.ts` (only imports from `usage-counter/reservation.ts`, never edits it), any new `e2e/**` spec file, `ContextEntry.jsx`/`SpreadView.jsx`/`OrientationGuideResults.jsx`/`GrantInviteKey.jsx`. If the diff grows beyond this list, stop and reconcile against this story before continuing.

### References

- [Source: epics.md#Story-4.1] — the 4 ACs verbatim; [#Epic-4] epic framing and FR/AD/NFR/UX-DR binding list
- [Source: prd.md §4.5 FR-11/FR-12] — the pre-3.5 metric list this story's ACs supersede; the FR-11 "Consequences" (admin-only reachability, daily-refresh floor, spend-to-date display) still apply verbatim
- [Source: ARCHITECTURE-SPINE.md AD-9, AD-10, AD-13, AD-18] — the binding authorization/aggregation/config-source-of-truth rules
- [Source: EXPERIENCE.md rows 32, 46, 61, 64, 80, 83, 85, 118] — "ugly but functional," plain-numeric voice, hidden-not-blocked nav pattern, stale-timestamp requirement
- [Source: DESIGN.md lines 115, 158, 166] — Admin Dashboard excluded from the Ornamental Divider motif and from design-polish investment
- [Source: 3-5-score-orientation-guide-groundedness-async.md] — the groundedness score's exact semantics and direction (quoted in the contract table); confirms `groundednessScore` is owner-readable but never frontend-rendered elsewhere, so this story is its first consumer
- [Source: 3-6-alert-tony-when-the-monthly-budget-nears-its-ceiling.md] — the Contract-values-table story format and `backend.ts` new-Lambda wiring precedent this story follows
- [Source: amplify/functions/usage-counter/reservation.ts, orientation-reconciler/handler.ts] — the exact reused code (Config read, status normalization, Scan pagination)
- [Source: amplify/data/resource.ts, amplify/auth/resource.ts, amplify/backend.ts] — current state confirming no admin infra exists yet (verified by direct inspection at story-creation time, 2026-07-26)
- [Source: src/App.jsx, src/components/GrantInviteKey.jsx, src/utils/account.js, src/utils/orientation.js] — the exact component/util patterns this story's frontend additions follow
- [Source: deferred-work.md "Silent scored-rate watch" entry] — the open item this story's live verification (Task 9) is positioned to close or update
- [Source: project-context.md] — the `a.json()` string-or-object parse guard requirement; owner-based/admin-group auth split; thin-Lambda-boundary rule

## Dev Agent Record

### Agent Model Used

OpenAI Codex (GPT-5)

### Implementation Plan

- Execute each task in story order using targeted failing tests before implementation, then run the full repository gates at task and story closeout.
- Establish the admin boundary first (Cognito group, group-authorized AppSync query, least-privilege Lambda wiring), then add the one-time grant command and defensive frontend utilities/UI.
- Preserve aggregate-only data handling, exact response contracts, hidden non-admin navigation, and the existing App-owned state pattern.

### Debug Log References

- 2026-07-27: Baseline `npm test` failed twice under shell-default Node v25.9.0 because its invalid global `--localstorage-file` shim replaced jsdom localStorage. Re-running unchanged under the repository's established Node v24.9.0 runtime passed 271/271.
- 2026-07-27: The connected in-app browser execution bridge rejected initialization before browser access, so the shared-account live checks used the established local Playwright auth state. Tony's fresh-sign-in UI check remains the only open live gate.

### Completion Notes List

- Task 0 complete: preserved and separately committed pre-existing Epic 3/story-creation artifacts as `8b684f6`; baseline tests (271/271), lint, typecheck, build, and Amplify sandbox reachability passed.
- Task 1 complete: declared the single `Admin` Cognito group; the source invariant, typecheck, and full 271-test regression suite passed.
- Task 2 complete: added the 15-second `admin-metrics` Lambda, five parallel paginated reads, exact aggregate response semantics, and five DI tests covering empty/mixed/legacy/null/pagination/missing-record/error cases. Targeted tests, typecheck, and the full 276-test suite passed.
- Task 3 complete: exposed only the `adminMetrics` JSON query behind AppSync's `allow.group('Admin')` gate; typecheck and the full 276-test suite passed with no model-schema changes.
- Task 4 complete: registered `adminMetrics`, granted read-only access to exactly five tables, and supplied exactly five table-name environment variables with no WAF change. Typecheck and all 276 tests passed.
- Task 5 complete: added `npm run grant-admin -- <email>`, reading the deployed User Pool and region from `amplify_outputs.json` and issuing one `AdminAddUserToGroup` call. Syntax, usage failure, lint, and all 276 tests passed.
- Task 6 complete: added fail-closed Cognito-group detection and defensive `a.json()` metrics parsing, with eight focused tests covering admin/non-admin/missing/error and string/object/AppSync-error boundaries. Lint and all 284 tests passed.
- Task 7 complete: added the plain metrics-only dashboard with announced loading, retryable error, honest null states, readable refresh time, score-direction clarification, and Back navigation. Five component tests, lint, and all 289 tests passed.
- Task 8 complete: wired fail-closed admin discovery, hidden navigation, first-priority dashboard rendering, Back, and auth-loss/sign-out resets into App-owned state. Two new App tests, the full 291-test suite, lint, and the authenticated non-admin Playwright flow passed.
- Task 9 partial live evidence: sandbox deploy succeeded; the `Admin` group and Tony membership were confirmed; the aggregate-only Lambda returned plausible live metrics (2 FirstGen, 1 SecondGen, 16 SUCCEEDED Sessions, 1/6 hit-rate, $0.48 of $30, average floater score 0.25 across 2 scored Sessions); the shared test account had no Admin group/button and AppSync rejected its direct query as `Unauthorized`. Tony's fresh-sign-in dashboard/Back visual check remains open.
- Task 9 complete: Tony confirmed the fresh-sign-in Admin Dashboard showed the live metrics and refresh timestamp with the required plain presentation and working Back navigation.
- Task 10 complete (2026-07-28): closed the gap the Epic 3 retro action item exists to catch — the implementation had been coded, tested, and reviewed (293/293 tests, lint/typecheck/build clean) but never actually committed or pushed; only docs (`8b684f6`) had landed. Ran a credential sweep (no key/secret/private-key patterns in the diff or new files; `amplify_outputs.json` untracked), staged the full 20-file diff exactly matching the File List below, committed as `ad1fe77`, and pushed to `main`. Evidence:

  ```
  $ git status --short
  (empty)

  $ git log -1
  commit ad1fe77bebc67b9f3341c8e211d090ffb6f1b2fc
  Author: Tony Reynolds <grondak@gmail.com>
  Date:   Tue Jul 28 20:44:10 2026 -0400

      feat: add admin dashboard usage & spend metrics (story 4.1)
  ```

### File List

- _bmad-output/implementation-artifacts/4-1-view-usage-spend-metrics.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- amplify/auth/resource.ts
- amplify/backend.ts
- amplify/data/resource.ts
- amplify/functions/admin-metrics/handler.test.ts
- amplify/functions/admin-metrics/handler.ts
- amplify/functions/admin-metrics/resource.ts
- package.json
- scripts/grant-admin.mjs
- e2e/authenticated.spec.js
- src/App.jsx
- src/AppAuth.test.jsx
- src/components/AdminDashboard.jsx
- src/components/AdminDashboard.test.jsx
- src/utils/adminAuth.js
- src/utils/adminAuth.test.js
- src/utils/adminMetrics.js
- src/utils/adminMetrics.test.js

## Change Log

- 2026-07-26: Story created via create-story workflow. First admin-anything story in the codebase — no Cognito group, admin Lambda, or admin UI existed before this. Defined two things the spec leaves silent (Daily Orientation Limit hit-rate formula; confirmed and prominently flagged Story 3.5's inverted groundedness-score direction) so implementation is unambiguous. Status: ready-for-dev.
- 2026-07-27: Independent fresh-context review pass (checklist-driven), re-verifying every falsifiable technical claim against the live repo, dependencies, and source docs rather than trusting the first pass. Found and fixed two defects: the "Table reads" contract row miscounted "4 scans + 2 gets" when only 3 scans are ever named anywhere in the story (corrected to 3 scans + 2 gets, five reads total, matching the five `grantReadData` grants); the `AdminDashboard` frontend-utils row cited `AccountBar`'s `refreshAccountFn` prop as the pattern to mirror, but `AccountBar` has no such prop — corrected to `GrantInviteKey.jsx`'s actual `refreshAccountFn = getMyAccount` pattern. Also added: a Dev Notes clarification that AD-9's MonthlySpend admin-group-read wording is satisfied indirectly (query-level gate + Lambda IAM, not a per-model auth rule) rather than literally; one new Task 8 e2e assertion (existing `e2e/authenticated.spec.js`, not a new spec file) automating AC 2's non-admin/hidden-nav half; a worked JSON example on the response-shape contract row; softened an "every other handler" overgeneralization (`check-invite-key/handler.ts` is the one exception). Every other claim checked out true, including all cited `src/App.jsx` line ranges, the CDK `grantReadData()`/`Scan` claim, the groundedness-score direction, and the 271/271 baseline test count (confirmed by running `npm test`). Status remains ready-for-dev.
- 2026-07-27: Second independent fresh-context review pass, specifically auditing whether the prior pass's edits were applied correctly and consistently everywhere (not just re-trusting the Change Log's own claims) — verified all 7 edited/cross-referenced items directly against the current file text and the actual repo (`GrantInviteKey.jsx`/`AccountBar` prop shapes, all 11 `handler.ts` files' DI patterns, the worked JSON example's validity, six cross-referencing locations for the e2e-scope change, `e2e/authenticated.spec.js`'s and `playwright.config.js`'s actual structure), plus a lighter independent sanity pass on unchanged claims (Cognito `groups`, `adminMetrics` query absence, WAF's 3 named operations, groundedness direction, epics.md AC text verbatim match). All clean — no new contradictions introduced by the prior edits. One real finding: the new Task 8 e2e assertion (button absence) could trivially pass before the async `fetchAuthSession`-driven admin-check effect resolves, since Playwright's `not.toBeVisible()` doesn't retry a matcher that's already satisfied — fixed by adding an explicit wait-for-settle instruction and moving the assertion to the end of the existing interaction sequence. Status remains ready-for-dev.
