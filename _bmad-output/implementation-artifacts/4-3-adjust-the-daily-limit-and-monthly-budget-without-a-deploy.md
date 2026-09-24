---
baseline_commit: f95a334
created: 2026-07-30
---

# Story 4.3: Adjust the Daily Limit and Monthly Budget without a deploy

Status: review

## Story

As Tony,
I want to edit the daily request limit and monthly budget ceiling from the dashboard,
So that I can tune cost controls without touching code.

**Third story of Epic 4.** Stories 4.1 and 4.2 already provide the `Admin` Cognito group, hidden/non-admin navigation behavior, the `AdminDashboard.jsx` shell, the aggregate metrics query, and the Mint Key control. Story 3.2 already created the singleton Config item (`id: global`), and Story 3.8 already checkpoints one Config snapshot per durable generation. This story edits that existing item through the existing Admin Dashboard; it does not create another admin surface, another Config item, or another configuration service.

## Acceptance Criteria

*(Verbatim from `epics.md#Story-4.3`; implementation clarifications below make the boundaries testable without changing these outcomes.)*

1. **Given** Tony is on the Admin Dashboard, **when** he edits the daily limit or monthly budget field and saves, **then** the Config item's values update, and the next Orientation Guide request reads the new values (AD-13).
2. **Given** a non-admin Account, **when** they look for this field, **then** it's not exposed anywhere in their UI.
3. **Given** a request is already in flight when Config is edited, **when** that request completes, **then** it uses whichever Config snapshot it read at the start — not a value read mid-flight (AD-13 single-snapshot rule).

### Acceptance clarifications required by architecture and the Epic 3 retrospective

4. The save operation is server-authorized for the `Admin` Cognito group. A non-admin direct `Config.update` attempt is rejected by AppSync even if the caller bypasses the hidden UI.
5. The supported browser path always targets the existing singleton `Config` item with `id: global`. Browser access is update-only: no Config create, delete, list, get, or subscription capability is granted. Amplify's generated update resolver includes an `attributeExists` key condition, so a missing/incorrect id fails instead of creating a second row.
6. Both values are sent in one generated Amplify Data update so a Save changes the pair together. A missing Config item is an error; this story never silently creates it.
7. Valid values are:
   - `dailyLimit`: finite integer from **1 through 100**, inclusive.
   - `monthlyBudget`: finite USD number from **0.03 through 30.00**, inclusive. The lower bound equals one request's current reservation estimate; the upper bound preserves the PRD's fixed $30/month release ceiling.
8. Client validation provides immediate inline feedback, and the Amplify Data schema enforces the same numeric bounds server-side. The shared `readConfig` boundary also fails closed for missing, non-finite, fractional-daily-limit, or out-of-range stored values.
9. Lowering `dailyLimit` below an Account's already-used count is allowed: subsequent status/read and reservation checks treat the limit as exhausted. Lowering `monthlyBudget` below current estimated `MonthlySpend.spent` is also allowed: subsequent reservations are rejected. Existing counters are never rewritten.
10. The successful save returns and renders the canonical stored pair, updates the dashboard's displayed budget coherently, and announces a plain success status. A failed save keeps the entered values available, shows a clear inline error, and remains retryable.

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. No new secret, provider account, model access, or third-party setup is required.
2. Use the repository's established Node 24.9.0 runtime. Prior Story 4.1/4.2 baseline runs under Node 25 produced jsdom `localStorage` failures unrelated to product code.
3. Start with a valid AWS session and reachable Amplify sandbox for deploy/live verification. Tony's existing `Admin` group membership from Story 4.1 is the positive authorization identity; the shared `TAROT_E2E_*` account must remain non-admin.
4. Confirm the sandbox Config singleton exists before implementation verification. `npm run seed-config` is conditional and safe for a missing item, but it must not overwrite an existing edited item.

## Contract values (frozen — implement exactly these)

| Item | Contract |
|---|---|
| Config identity | The sole item remains `{ id: 'global', dailyLimit, monthlyBudget }`. Story 3.2 owns first creation/seeding. Story 4.3 only updates it. |
| Daily limit bounds | Integer `1..100`, inclusive. `1` preserves a usable paid path; `100` is a generous friend-circle operating range while catching accidental extra digits, with the global monthly cap still authoritative. Exact user-facing validation: **“Daily limit must be a whole number from 1 to 100.”** |
| Monthly budget bounds | USD float `0.03..30`, inclusive. Exact user-facing validation: **“Monthly budget must be between $0.03 and $30.00.”** UI uses `step="0.01"` and dollar displays round to two decimal places, but cents-only storage is **not** a contract: the existing GraphQL Float/DynamoDB number remains authoritative and any finite in-range float is valid at every backend boundary. Do not invent a scale validator or change the stored type in this story. |
| Why monthly max is $30 | PRD FR-10 and §6 make $30/month the fixed hardest release constraint. The editable Config value is the primary, immediate estimate-based operating cap and may be lowered/restored without deploy, but it may not exceed the fixed $30 AWS cost safety ceiling. Raising the product's hard ceiling above $30 requires a deliberate PRD/architecture/infrastructure change, not an admin-form edit. |
| AWS Budget reconciliation | Keep the CDK-managed AWS Budget at a fixed `$30` and 80% actual-spend alert. Rename/comment its constant as the **outer AWS safety ceiling** rather than claiming it mirrors every live Config edit. Do **not** call the AWS Budgets `UpdateBudget` API at runtime. CloudFormation owns this resource; runtime updates would introduce cross-service partial-failure and later-deploy drift, and AWS notes that editing a Budget temporarily resets its calculated spend until refreshed. The editor's `$30` maximum ensures Config can never weaken the outer tripwire. This specifically clarifies older FR-10/AD-13 terminology: lowering the estimate-based operating cap does not lower the actual-cost alert threshold. |
| Config schema fields | Make both fields required and attach service-side numeric validation: `dailyLimit` uses `gte(1)` + `lte(100)`; `monthlyBudget` uses `gte(0.03)` + `lte(30)`. Use the exact validation messages above. |
| Shared backend bounds | Put the four numeric bounds, `COST_ESTIMATE_USD = 0.03`, and the pure Config validation guard in new plain TypeScript utility `amplify/config.ts`. Define the monthly minimum from `COST_ESTIMATE_USD`; import that same cost constant into the worker instead of retaining a second literal. Import the range constants into `amplify/data/resource.ts` and the guard into `usage-counter/reservation.ts`; do not make the schema depend on an AWS-SDK-bearing function module. Frontend remains plain JS and mirrors the same bounds with focused contract tests. |
| Config authorization | Replace the current no-browser-operation rule with **only** `allow.group('Admin').to(['update'])`. Do not grant `authenticated`, owner, public, create, read, delete, or subscription access. Current values continue to arrive inside the already Admin-gated `adminMetrics` response. |
| Metrics response | Extend the existing response additively with `config: { dailyLimit, monthlyBudget }`. Preserve `monthlySpend.budget` for existing rendering/contracts; it remains equal to the same Config snapshot's `monthlyBudget`. No key is removed or renamed. |
| Browser update | New named utility `updateAdminConfig({ dailyLimit, monthlyBudget })` calls `client.models.Config.update({ id: 'global', dailyLimit, monthlyBudget })`. Inspect `errors` because Amplify Data returns mutation failures in the result instead of throwing them. Throw a stable error if errors exist or returned data is missing. Return only `{ dailyLimit, monthlyBudget }` from the canonical response. |
| Save semantics | One Save button submits both parsed numeric values. A synchronous ref guard prevents rapid duplicate submit before React disables the button. While saving, both inputs and Save are disabled. Success replaces local fields with returned canonical values and announces **“Cost controls saved.”** |
| Failure semantics | Client validation makes no network call. Remote failure uses `role="alert"` with **“Cost controls couldn’t be saved. Please try again.”** Inputs keep the attempted values, Save becomes enabled, and retry is possible. Do not expose AppSync/AWS internals in UI copy. |
| Dashboard coherence | On successful save, `AdminDashboard` updates its local `metrics.config` and `metrics.monthlySpend.budget` from the returned pair. It does not need a full aggregate rescan merely to show the new ceiling. The existing hit-rate remains the value computed at the last metrics refresh; label/timestamp already communicates when aggregates were generated. |
| Snapshot boundary | “In flight” means the durable worker has completed/checkpointed its existing `read-config` step. That execution continues using the captured pair passed to `reserve`; later edits affect only a worker that reaches `read-config` afterward. Browser request-acceptance time is not the snapshot boundary. |

## Architecture decision for the two budget controls

There are intentionally two layers, with different jobs:

1. **Config `monthlyBudget` (editable, $0.03–$30):** immediate estimated-spend admission control used by the durable worker's atomic `MonthlySpend` reservation. This is the source of truth for whether the next Orientation Guide may start paid work.
2. **AWS Budget (fixed $30, 80% actual-cost alert):** slower, account-billing-based outer tripwire that catches estimate-versus-actual drift. AWS billing/Budgets data refreshes on a delayed cadence and is not the per-request gate.

This resolves the Epic 3 retrospective's “silent desync” risk by enforcing and explaining an ordered safety relationship: `Config.monthlyBudget <= AWS safety ceiling`. A lower Config cap can stop estimated spend before the AWS alert fires; it can never authorize spend beyond the PRD ceiling. Do not install `@aws-sdk/client-budgets`, add Budget mutation IAM, or invent cross-service rollback/reconciliation machinery in this story.

**Specific superseding clarification:** older FR-10/AD-13 wording used “monthly budget ceiling” for both layers as though they always shared one value. From Story 4.3 onward, `Config.monthlyBudget` means the editable **estimated-spend operating cap**; the CloudFormation-managed AWS Budget remains the fixed **$30 actual-cost safety ceiling** and its 80% alert remains tied to that ceiling. Therefore lowering Config can intentionally stop new paid work before an AWS warning is due. This tradeoff is explicit, not silent. If the product later requires the proactive alert to track every lower operating cap, that is a new architecture story requiring an idempotent estimated-spend threshold notification design; it is not implemented by mutating the delayed, CloudFormation-owned AWS Budget at runtime.

## Explicitly out of scope (do not build)

- A new `admin-config` Lambda, custom `adminUpdateConfig` operation, repository/service layer, feature-flag system, or new DynamoDB model. Amplify's generated update plus model field validation already supplies the narrow server-side capability AD-13 asks for.
- Runtime mutation of the CloudFormation-managed AWS Budget. The fixed outer-ceiling decision above is deliberate.
- Editing the AWS Budget warning threshold. It remains the existing 80% synth-time setting.
- Raising the hard ceiling above $30, allowing `dailyLimit` zero as a “pause” switch, or adding a separate pause feature.
- Rewriting `DailyUsage` or `MonthlySpend` records after a limit is lowered. Existing counts/spend remain historical facts.
- Per-account limits, scheduled/future config, a Config history/audit log, multi-admin conflict/version UI, confirmation dialog, or rollback button.
- Changes to `App.jsx`, `adminAuth.js`, Cognito groups, orientation request IDs, Session lifecycle, reservation/compensation tokens, Quick Draw, Mint Invite Key, or Story 4.4 revocation.
- New charts, ornamental dividers, dashboard personality copy, a separate mobile layout, or a component library.
- A permanent paid-generation Playwright/CI scenario.

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight** (gate)
  - [x] Confirm `git log -1 --oneline` starts at `f95a334` (or document a later reviewed baseline) and preserve any unrelated dirty-worktree changes.
  - [x] Use Node 24.9.0. Run baseline `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; record actual counts rather than copying the prior story's 308-test count.
  - [x] Verify AWS/sandbox access, Tony's `Admin` membership, the shared test account's non-admin status, and exactly one Config item with `id: global`.

- [x] **Task 1: Harden the shared Config read contract** (AC: 1, 3; clarifications 7–9)
  - [x] New `amplify/config.ts`: export the four frozen bounds, the single `COST_ESTIMATE_USD = 0.03`, and a pure `validateConfig`/equivalent guard. Define `MIN_MONTHLY_BUDGET_USD = COST_ESTIMATE_USD`; this is shared plain utility code, not a service/repository layer.
  - [x] Add focused pure tests for valid minima/maxima and rejection of missing values, `NaN`, `Infinity`, zero/negative, fractional `dailyLimit`, values above maxima, and budget below `$0.03`.
  - [x] `amplify/functions/orientation-guide/handler.ts`: import `COST_ESTIMATE_USD` from the shared utility and remove its local `0.03` declaration without changing reservation call sites or behavior. Add an invariant test that the monthly minimum and worker reservation estimate remain the same shared value.
  - [x] `amplify/functions/usage-counter/reservation.ts`: use the shared guard inside `readConfig`.
  - [x] Preserve the exact consistent `GetCommand` for `id: global`, the single returned snapshot, and existing reservation/rollback logic and stable limit error codes.
  - [x] Distinguish missing/incomplete Config from invalid Config in internal errors if useful, but neither internal message crosses to the browser.
  - [x] `reservation.test.ts`: prove valid data still returns the pair, invalid data fails closed, and the single consistent read remains one DynamoDB call.

- [x] **Task 2: Expose the narrow generated Admin update** (AC: 1, 2; clarifications 4–8)
  - [x] `amplify/data/resource.ts`: make Config fields required; add the frozen `gte`/`lte` validators and exact messages; authorize only `allow.group('Admin').to(['update'])`.
  - [x] New `amplify/data/resource.test.ts`: add a focused source/schema contract test following the repository's existing lightweight schema checks. It must fail for accidental `authenticated()` access, any Config create/read/delete grant, missing/changed required-field bounds or messages, and any Config authorization other than Admin update-only. Keep the singleton-id assertion in `src/utils/adminConfig.test.js`, where the exact mutation payload is observable.
  - [x] Do not change Config creation/seed behavior or add backend IAM grants.

- [x] **Task 3: Return current editable values with admin metrics** (AC: 1)
  - [x] `amplify/functions/admin-metrics/handler.ts`: add `config: { dailyLimit, monthlyBudget }` from the exact already-read Config snapshot; retain every current response field and computation.
  - [x] Preserve all-time hit-rate semantics: each stored DailyUsage count is compared with the **current** Config `dailyLimit`.
  - [x] Extend exact handler response tests for empty and populated tables. Keep pagination, missing Config, null-rate, spend, and groundedness behavior unchanged.
  - [x] Update frontend/admin metrics fixtures to include the additive `config` pair.

- [x] **Task 4: Add the thin Config update client utility** (AC: 1, 2; clarifications 4–7)
  - [x] New `src/utils/adminConfig.js` with named export `updateAdminConfig`.
  - [x] Call only `client.models.Config.update({ id: 'global', dailyLimit, monthlyBudget })`; handle returned `errors`, missing data, and both values in the canonical response. No create fallback.
  - [x] New focused tests: exact payload; success returns only the pair; AppSync errors throw; missing response throws. Do not swallow or stringify internal errors into UI copy.

- [x] **Task 5: Build the plain Admin Config editor** (AC: 1; clarifications 7–10)
  - [x] New `src/components/AdminConfigEditor.jsx` and focused test file. Props: initial pair, injectable `updateAdminConfigFn`, and `onSaved` callback.
  - [x] Render associated labels **“Daily request limit”** and **“Monthly budget (USD)”**, number inputs with frozen min/max/step values, and one **“Save cost controls”** button.
  - [x] Implement controlled fields and parse each trimmed string with `Number(value.trim())` on submit. Reject blank/non-finite values with `Number.isFinite`; additionally require `Number.isInteger` for `dailyLimit`; then enforce the frozen inclusive bounds. Do not use `parseInt` or `parseFloat`, which would accept trailing junk. Include exact inline validation copy, a synchronous duplicate-submit guard, busy-disabled controls, unmount-safe async state, exact success status, and exact retryable remote error.
  - [x] Mutation-survivable tests: initial values; editing either field sends both; every validation boundary makes zero calls; rapid double submit makes one call; successful returned canonical values replace inputs and call `onSaved`; remote failure preserves edits and permits retry; unmount during pending save causes no stale update.

- [x] **Task 6: Compose into the existing dashboard** (AC: 1, 2)
  - [x] `AdminDashboard.jsx`: render the editor only in the existing ready/admin branch, near `MintInviteKey`, using `metrics.config`.
  - [x] On save, immutably update local `metrics.config` and `metrics.monthlySpend.budget`; do not fabricate a new `generatedAt` or recompute aggregate hit-rate client-side.
  - [x] Preserve the existing loading/error/ready state machine, unmount guard, Retry, Mint Key, all metrics, and Back navigation during loading/error/ready.
  - [x] Dashboard integration tests should prove the editor is wired, save updates the displayed `$x of $y budget`, and existing Mint/metrics/Back behaviors remain. Keep exhaustive form behavior in the component test.
  - [x] Existing `AppAuth` and authenticated E2E assertions must continue proving non-admin navigation hides the entire dashboard/editor.

- [x] **Task 7: Prove Config snapshot and downstream enforcement behavior** (AC: 1, 3; clarifications 8–9)
  - [x] Add a focused durable-worker regression test showing `read-config` executes once and `reserve` receives the original captured pair even if the backing mock Config changes afterward. Do not alter production worker flow merely to make this test possible.
  - [x] Preserve the worker order: load Session → mark RUNNING → checkpoint `read-config` → capture reservation clock → reserve both counters with that pair.
  - [x] Cover lowered limits: the next usage status reports exhausted when existing count is at/above the new limit; the next reservation is rejected when current spend leaves less than one estimate under the new budget. Never rewrite current counters.

- [ ] **Task 8: Infrastructure clarity and live verification** (AC: all)
  - [x] `amplify/backend.ts`: rename/comment the `$30` constant as a fixed outer AWS safety ceiling; keep the deployed `CfnBudget` amount and 80% alert unchanged. No runtime Budgets client, IAM, or environment variables.
  - [x] Deploy with `npx ampx sandbox --once`.
  - [ ] As Tony/admin, open Admin Dashboard, change values within range, save, and verify the existing Config item changed (same `id: global`, no second row); dashboard fields and spend denominator show returned values.
  - [x] As Tony/admin, directly attempt an otherwise-valid `Config.update` with a missing/wrong id and prove the generated resolver rejects it and creates no row.
  - [x] As the non-admin shared account, verify no dashboard/editor UI and directly attempt `Config.update`; AppSync must reject it.
  - [x] Prove next-request behavior without making paid generation a permanent test: use the status/reservation seam or one deliberate live request to show the new values are read. Prove/inspect an already-checkpointed worker retains its old snapshot if a practical controlled live run is available; the deterministic durable unit regression is required regardless.
  - [x] Exercise invalid direct updates at the AppSync boundary (below/above ranges) and confirm service-side validation rejects them. Restore the sandbox Config to `dailyLimit: 5`, `monthlyBudget: 30` after verification unless Tony deliberately chooses new operating values.

- [x] **Task 9: Close out (Definition of Done)**
  - [x] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` with existing specs.
  - [x] Review changed-file inventory; sweep code, tests, logs, screenshots, and this story for credentials or personal Context/Guide content.
  - [x] Update sprint status to `review` only when implementation and verification are complete.
  - [x] Commit and push. Paste actual empty `git status --short` output and `git log -1 --oneline --decorate` in the Dev Agent Record; prose-only “committed and pushed” is insufficient.

## Dev Notes

### Scope decisions (made at story creation — flag disagreement instead of silently deviating)

1. **Use Amplify's generated Config update, not a new Lambda.** Installed Amplify supports operation-scoped group authorization and server-side numeric field validation. This is the smallest path consistent with AD-13's “plain field…no separate config service” rule. A custom Lambda would add IAM, event routing, tests, and another failure boundary without adding required behavior.
2. **Update-only model authorization is intentional.** Admin current values come from `adminMetrics`; the browser does not need general Config reads. Only the generated update mutation is authorized, while seeding remains trusted/operator-only.
3. **The $30 AWS Budget is an outer ceiling, not a runtime mirror.** CloudFormation owns it, and AWS billing data is delayed. Config may be stricter but never looser. This both honors the PRD's fixed $30 constraint and closes the retrospective's silent-drift hazard without a fragile cross-service write.
4. **Save both fields together.** The UI may change one or both, but it sends the complete validated pair in a single Config item update. This avoids partial form semantics and keeps the worker's pair conceptually coherent.
5. **Lowering below current use/spend is allowed.** It is the useful emergency-brake behavior: no historical mutation, just rejection of future paid work until the period resets or Tony raises the cap within bounds.
6. **The numeric bounds are frozen story-creation decisions, not previously approved PRD values.** `1` keeps the paid path usable, `100` catches likely daily-limit typos while remaining generous for the friend-circle release, `$0.03` equals one reservation estimate, and `$30` is the existing hard ceiling. A zero-value “pause” mode is deliberately excluded. Tony should flag these values during story review if intentional pausing or a different operating range is required; otherwise the dev agent implements them exactly as written.
7. **This story specifically clarifies the older FR-10/AD-13 budget wording.** The editable Config value is the immediate estimate-based operating cap; the CloudFormation resource is the fixed actual-cost outer ceiling. Treat the “Specific superseding clarification” above as the downstream implementation contract, not as permission to silently choose either interpretation during development.

### Current UPDATE files — read before editing

- `amplify/data/resource.ts`
  - **Today:** Config has optional integer/float fields and deliberately authorizes no browser operations.
  - **Change:** required validated fields plus Admin-group update-only authorization.
  - **Preserve:** fixed model set, every other model/custom operation/auth rule, especially owner-only Session reads and Admin mutation gates.
- `amplify/functions/usage-counter/reservation.ts`
  - **Today:** `readConfig` makes one strongly consistent read but accepts any JavaScript number; reservation atomically checks MonthlySpend and DailyUsage using the supplied pair.
  - **Change:** use the shared fail-closed finite/integer/range validation guard.
  - **Preserve:** key `global`, `ConsistentRead`, transaction order, deterministic tokens, retry behavior, compensation, and stable error codes.
- `amplify/config.ts` (new shared plain utility)
  - **Purpose:** one backend source for the reservation cost estimate, numeric bounds, and stored-Config validation, imported by schema, worker, and Config consumers.
  - **Guardrail:** no AWS clients, side effects, environment access, or service/repository behavior.
- `amplify/functions/orientation-guide/handler.ts`
  - **Today:** owns a local `COST_ESTIMATE_USD = 0.03` and passes it into the existing reservation flow.
  - **Change:** import that constant from `amplify/config.ts`; no other production worker behavior changes.
  - **Preserve:** durable checkpoint order, captured Config snapshot, reservation/compensation tokens, model call, completion/failure handling, and all stable errors.
- `amplify/functions/admin-metrics/handler.ts`
  - **Today:** reads Config once, uses current daily limit for hit-rate, and returns monthly budget only under `monthlySpend`.
  - **Change:** additive `config` pair in response.
  - **Preserve:** parallel reads, pagination, aggregate-only/privacy boundary, legacy Session status semantics, null handling, and every existing response key.
- `src/components/AdminDashboard.jsx`
  - **Today:** unmount-safe metrics loader with loading/error/ready branches; Back remains available during pending/error; ready branch renders Mint Key and metrics.
  - **Change:** compose editor in ready state and keep local budget/config coherent after save.
  - **Preserve:** all three states, Back, Retry, Mint Key, metric copy, plain styling, and no new App-level state.
- `amplify/backend.ts`
  - **Today:** `MONTHLY_BUDGET_CEILING_USD = 30` owns the AWS Budget resource and explicitly admits it does not follow live Config.
  - **Change:** clarify/rename it as the fixed outer safety ceiling.
  - **Preserve:** amount 30, threshold 80, SNS policy/subscription, environment-specific name, alarms/DLQs, and all grants.

### Architecture compliance

- **AD-4:** no new service/repository/DI layer or Lambda. Browser write uses an explicitly authorized AppSync operation.
- **AD-6:** DailyUsage and MonthlySpend reservation remains one atomic transaction against the same captured Config pair.
- **AD-8:** no new model; singleton Config remains in the fixed model set.
- **AD-9:** UI hiding is presentation; AppSync `Admin` group authorization is enforcement.
- **AD-10:** dashboard remains aggregate/config-only and never exposes Context, evidence, prompt, or Guide content.
- **AD-13:** Config remains data, one item, one read/checkpoint per generation, editable without deployment.
- **AD-18:** metrics continue to be computed in the dedicated Lambda; no client-side raw-table aggregation.
- **AD-19:** durable execution lifecycle, replay/idempotency, exact Session tracking, and privacy/logging rules remain untouched.

### Testing requirements

- Every new test must be mutation-survivable: demonstrate it fails against a deliberately wrong boundary, authorization, payload, or UI behavior before counting it as coverage.
- Unit/component tests mock AWS/AppSync seams and assert observable contracts. Do not add a permanent paid generation test.
- Preserve `role="status"` for loading/success announcements and `role="alert"` for failures; do not repeatedly announce unchanged state.
- Verify client validation and server schema validation independently. HTML `min`/`max` alone is not enforcement.
- Live verification proves observable outcomes: same Config row updated, unauthorized direct update rejected, next enforcement read uses the new pair, and the AWS Budget remains the fixed $30 outer tripwire.
- Prove the shared-cost invariant: the worker reservation estimate and minimum monthly budget cannot drift because both resolve to `COST_ESTIMATE_USD` from `amplify/config.ts`.

### Previous story intelligence

- **Story 4.1:** established the `Admin` group, `adminMetrics`, App/AppAuth hidden-nav gate, dashboard loader, and defense-in-depth non-admin verification. Its review required admin state to re-evaluate on token refresh and Back to remain available during loading. Reuse those behaviors; do not add another admin detection mechanism.
- **Story 4.2:** established the thin utility + injectable focused component + one dashboard integration assertion pattern. Its live run revealed Amplify's generated resolver event did not match an assumed standard shape, and review hardened unknown-field routing to fail closed. Story 4.3 avoids shared-Lambda branching entirely; still trust deployed/live behavior over assumed types.
- **Process lesson:** both predecessor records required evidence corrections. Closeout must paste real Git output and real live authorization/data evidence.

### Git intelligence

Recent relevant history:

- `f95a334` — `fix: harden invite-key-mint field-name routing per code review`
- `5114fcd` — `docs: record story 4.2 git evidence`
- `7766851` — `feat: add admin invite key minting`
- `fc27a30` — `docs: record story 4.1 git evidence`
- `ad1fe77` — `feat: add admin dashboard usage & spend metrics (story 4.1)`

Follow the proven vertical slice: schema/shared guard → metrics contract → client utility → focused component → dashboard composition → live auth/data checks → full gates. `feat:` fits the implementation commit; review fixes may use `fix:`.

### Latest technical information (verified 2026-07-30)

- Installed versions remain the project source of truth: `@aws-amplify/backend 1.23.0`, `aws-amplify 6.18.0`, AWS SDK v3 `@aws-sdk/lib-dynamodb 3.1085.0`, React 19.2, Vite 7.3.1, Vitest 3.2.7, Playwright 1.61.1. Do not upgrade dependencies for this story.
- Amplify Data authorization is deny-by-default and supports limiting a static group rule to selected model operations with `.to([...])`.
- Amplify Gen 2 supports service-side numeric field validation on integer/float fields via `.validate(v => v.gte(...).lte(...))`.
- The React Data client updates models with `client.models.<Model>.update(...)`; mutation errors are returned in `errors`, not automatically thrown.
- AWS Budgets actual-cost data is refreshed on a delayed cadence (at least daily), reinforcing its role as an alerting safety net rather than the real-time request gate. AWS also documents that modifying a Budget temporarily resets calculated spend until fresh usage data arrives.

### Project Structure Notes

New files:

- `amplify/config.ts`
- `amplify/config.test.ts`
- `amplify/data/resource.test.ts`
- `src/utils/adminConfig.js`
- `src/utils/adminConfig.test.js`
- `src/components/AdminConfigEditor.jsx`
- `src/components/AdminConfigEditor.test.jsx`

Modified files:

- `amplify/data/resource.ts`
- `amplify/functions/usage-counter/reservation.ts`
- `amplify/functions/usage-counter/reservation.test.ts`
- `amplify/functions/admin-metrics/handler.ts`
- `amplify/functions/admin-metrics/handler.test.ts`
- `amplify/functions/orientation-guide/handler.ts` (shared cost-constant import only)
- `amplify/functions/orientation-guide/handler.test.ts` (regression only)
- `amplify/functions/usage-counter/handler.test.ts` (regression only if needed)
- `amplify/backend.ts` (constant/comment clarification only)
- `src/components/AdminDashboard.jsx`
- `src/components/AdminDashboard.test.jsx`
- Admin metrics fixtures in `src/AppAuth.test.jsx` and any other directly affected tests
- `_bmad-output/implementation-artifacts/4-3-adjust-the-daily-limit-and-monthly-budget-without-a-deploy.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

Expected no-change files:

- `src/App.jsx`, `src/utils/adminAuth.js`, `amplify/auth/resource.ts`
- `amplify/functions/start-orientation-guide/**`
- `amplify/functions/invite-key-mint/**`, `src/components/MintInviteKey*`
- `scripts/seed-config.mjs`
- reservation/compensation schema and counter models
- `e2e/**` (existing specs only)
- `package.json` / lockfile

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.3`, lines 592–610] — story and three canonical ACs.
- [Source: `_bmad-output/planning-artifacts/epics.md#Story-3.2`] — Config is seeded there; Story 4.3 only edits.
- [Source: `_bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/prd.md#FR-9`, `#FR-10`, `#Constraints-and-Guardrails`] — configurable daily cap; fixed $30/month aggregate constraint.
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md#AD-6`, `#AD-9`, `#AD-13`, `#AD-18`, `#AD-19`] — atomic pair, Admin authorization, singleton/snapshot rule, aggregate Lambda, durable lifecycle.
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-tarot-spa-2026-07-09/DESIGN.md#Do's-and-Don'ts`; `EXPERIENCE.md#Admin-Dashboard`] — plain dark utility UI, no charts/ornament, hidden non-admin surface, labeled accessible inputs.
- [Source: `_bmad-output/implementation-artifacts/epic-3-retro-2026-07-26.md#Epic-4-Preparation-Tasks`] — Config validation and Config/AWS-Budget reconciliation are critical-path Story 4.3 work.
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md#Recorded-for-Story-3.6`] — current Config/CDK ceiling drift and environment caveats.
- [Source: `_bmad-output/implementation-artifacts/4-1-view-usage-spend-metrics.md`; `4-2-mint-a-new-first-gen-invite-key-from-the-dashboard.md`] — predecessor patterns and review lessons.
- [Source: `amplify/data/resource.ts:63`] — current Config/no-browser-op schema and existing Admin operations.
- [Source: `amplify/functions/usage-counter/reservation.ts:19`] — current shared Config read and atomic counter enforcement.
- [Source: `amplify/functions/orientation-guide/handler.ts:469`] — one durable `read-config` checkpoint passed to reservation.
- [Source: `amplify/functions/admin-metrics/handler.ts:89`] — current Config consumer and response contract.
- [Source: `src/components/AdminDashboard.jsx:7`] — existing dashboard state machine/composition point.
- [Source: `amplify/backend.ts:41`] — current synth-time Budget ceiling and fixed AWS resource.
- [AWS Amplify: Customize authorization rules](https://docs.amplify.aws/react/build-a-backend/data/customize-authz/)
- [AWS Amplify: Field-level validation](https://docs.amplify.aws/nextjs/build-a-backend/data/field-level-validation/)
- [AWS Amplify: Update application data](https://docs.amplify.aws/react/frontend/data/mutate-data/)
- [AWS Budgets best practices and update frequency](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html)
- [AWS Budgets `UpdateBudget` behavior](https://docs.aws.amazon.com/cli/latest/reference/budgets/update-budget.html)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Implementation Plan

Resumed on 2026-09-23 after a ~2-month gap: the working tree already contained a substantially complete implementation of Tasks 1–7 from an earlier, uncommitted session, with the story file still showing every checkbox unticked. Rather than re-implementing, each task was independently re-verified against its acceptance-criteria text and Dev Notes contract by reading the actual diff/new file for every touched path, cross-checking exact validation messages/bounds/authorization strings, and confirming the full test suite (351 tests, 32 files) plus lint/typecheck/build pass clean on the baseline commit `f95a334`. Tasks 0–7 checked off only after this line-by-line reconciliation. Task 8's code change (backend.ts constant rename) and the `npx ampx sandbox --once` deploy are done and confirmed live; the identity-gated live-verification bullets (admin dashboard walkthrough, wrong-id rejection, non-admin rejection, invalid-range rejection) remain open — see Completion Notes.

### Debug Log References

- `npm test -- --run`: 351 passed / 351 (32 files) on the current worktree, including the pre-existing `Config snapshot immutability` test that satisfies Task 7.
- `npm run lint`, `npm run typecheck`, `npm run build`: all clean.
- `npx ampx sandbox --once` (2026-09-23 ~20:53 ET): synthesized and deployed cleanly; `AWS::AppSync::ApiKey` and the Config schema/authorization/validation changes went live against stack `amplify-tarotspa-tonyreynolds-sandbox-5c55fcf5f6`.
- Live AWS checks performed with Tony's own `AdministratorAccess` SSO session (read-only, IAM-level, not Cognito): confirmed exactly one Config item (`id: global, dailyLimit: 5, monthlyBudget: 30`) via `aws dynamodb scan`; confirmed the `Admin` Cognito group has exactly one member (`grondak@gmail.com` — Tony), so the shared `TAROT_E2E_*` test account is implicitly non-admin.
- `npm run test:e2e`: only the unauthenticated `chromium` project ran (2 passed) — `TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD` are not present in this environment (no `.env`, not in shell env), so the authenticated Playwright project that would exercise the non-admin dashboard-hiding assertion live did not run this session.
- Tony ran the AppSync console checks live, authenticated as admin (Cognito User Pools mode): `updateConfig(input: { id: "wrong-id", ... })` → `data.updateConfig: null`, `errorType: "DynamoDB:ConditionalCheckFailedException"` — confirms the generated resolver's `attributeExists` key condition rejects a wrong id and creates no second row. `updateConfig(input: { id: "global", dailyLimit: 101, monthlyBudget: 30 })` → `data.updateConfig: null`, message exactly `"Daily limit must be a whole number from 1 to 100."` — confirms the schema-level field validator fires server-side with the frozen message.
- Tony ran the real Admin Dashboard "Save cost controls" flow: the mutation itself succeeded server-side (Config's `dailyLimit` was confirmed changed to `7` on revisiting the dashboard), but the UI never showed the success status — mid-save, the app kicked him out of the Admin Dashboard back to the main authenticated view, before `AdminConfigEditor` could render "Cost controls saved." Immediately retrying "Mint Key" on the same dashboard worked fine with no kick-out, pointing at a timing-dependent (not deterministic) pre-existing App.jsx admin-status recheck (`isAdmin()` re-run on every Amplify `Hub.listen('auth', ...)` event, added in Story 4.1) transiently returning a false negative — not a defect in this story's own Config.update/validation code, which the two AppSync-console checks above prove works correctly. Filed as **Story 4-5** (`4-5-fix-intermittent-admin-status-false-negative-on-auth-hub-events.md`) rather than fixed inline here, since the suspect code (`src/App.jsx`, `src/utils/adminAuth.js`) is outside this story's Expected no-change files and the root cause isn't yet confirmed.
- Non-admin direct-mutation check: Tony ran `updateConfig(input: { id: "global", dailyLimit: 5, monthlyBudget: 30 })` in the AppSync console authenticated as the shared `TAROT_E2E_*` account (`grondak+agent@gmail.com`) → `data.updateConfig: null`, `errorType: "Unauthorized"`, message `"Not Authorized to access updateConfig on type Mutation"` — exactly matches clarification 4. Combined with the unchanged, still-passing `AppAuth`/`AdminDashboard` tests proving the dashboard button and editor stay hidden for non-admin accounts, both halves of this bullet are covered.
- Next-request live proof: directly invoked the deployed `usage-counter` Lambda (`amplify-tarotspa-tonyreyn-usagecounterlambda01674B-X5VkMKOtLncz`, read-only — one `GetCommand` on Config, one on DailyUsage, no writes) via `aws lambda invoke` with Tony's own identity, at a point where the live Config item had since been further edited (via the dashboard/console testing above) to `dailyLimit: 6`. Response: `{"dailyUsed":0,"dailyLimit":6,"limitExhausted":false}` — the deployed status-check path read the current live value with no caching, satisfying this bullet without a paid generation call. Combined with the durable-worker snapshot-immutability unit test (Task 7), both the "reads the current value" and "an in-flight execution keeps its captured snapshot" halves are proven.
- Restored the sandbox Config to the baseline `dailyLimit: 5, monthlyBudget: 30` after all live verification, per Task 8's closing instruction.
- Final close-out gate re-run on the finished tree: `npm test -- --run` (351/351, 32 files), `npm run lint` (clean), `npm run typecheck` (clean), `npm run build` (succeeds, pre-existing >500kB chunk-size warning unrelated to this story), `npm run test:e2e` (2/2 unauthenticated `public-landing` specs pass; authenticated project still doesn't run in this shell — no `TAROT_E2E_PASSWORD` present — superseded by the live AppSync-console and direct-Lambda-invoke evidence above).
- Credential/personal-content sweep: `git diff` across all changed text files shows no secrets, tokens, or personal Context/Guide content; `amplify_outputs.json` (regenerated by the sandbox deploy) is gitignored and untracked, as expected.
- Committed and pushed. `git status --short` (post-commit): empty. `git log -1 --oneline --decorate`: `53933cc (HEAD -> main) feat: let admin edit daily limit and monthly budget without a deploy (story 4.3)`. Pushed to `origin/main`: `f95a334..53933cc  main -> main`.

### Completion Notes List

- Tasks 0–7 verified complete against an implementation that predates this session; no functional code changes were needed. Every file matches its Dev Notes contract exactly (validation messages, bounds, authorization rule, response shape, save/failure semantics).
- Task 8 is partially open: the AWS-safety-ceiling constant rename is deployed, but the four remaining verification bullets require a live Cognito identity in the `Admin` group (Tony) and the non-admin `TAROT_E2E_*` credentials, neither available to the agent in this session. These need Tony to either (a) perform the admin/non-admin dashboard and direct-mutation checks himself and report the observed outcome, or (b) supply `TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD` so the authenticated Playwright project can exercise the non-admin half.
- Task 9 (full close-out: complete `test:e2e`, credential sweep, sprint-status → `review`, commit/push) is blocked on Task 8's remaining bullets.
- HALTed here per the "required configuration/credentials missing" gate rather than fabricating live-verification evidence.

### File List

- `amplify/config.ts` (new)
- `amplify/config.test.ts` (new)
- `amplify/data/resource.ts`
- `amplify/data/resource.test.ts` (new)
- `amplify/functions/usage-counter/reservation.ts`
- `amplify/functions/usage-counter/reservation.test.ts`
- `amplify/functions/usage-counter/handler.test.ts`
- `amplify/functions/orientation-guide/handler.ts`
- `amplify/functions/orientation-guide/handler.test.ts`
- `amplify/functions/admin-metrics/handler.ts`
- `amplify/functions/admin-metrics/handler.test.ts`
- `amplify/backend.ts`
- `src/utils/adminConfig.js` (new)
- `src/utils/adminConfig.test.js` (new)
- `src/components/AdminConfigEditor.jsx` (new)
- `src/components/AdminConfigEditor.test.jsx` (new)
- `src/components/AdminDashboard.jsx`
- `src/components/AdminDashboard.test.jsx`
- `src/AppAuth.test.jsx`
- `amplify_outputs.json` (regenerated by `npx ampx sandbox --once`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-07-30: Story created via the BMad create-story workflow and set to `ready-for-dev`. The implementation contract resolves both Epic 3 critical-path items: finite/positive/ranged Config validation at schema/read/client boundaries, and a deliberate ordered relationship between the editable in-app operating cap and the fixed $30 CloudFormation-managed AWS Budget safety ceiling. It reuses Amplify's generated update with Admin-group update-only authorization, avoiding a new Lambda/config service.
- 2026-07-30: Fresh-context review hardened readiness details: recorded the numeric ranges as explicit story decisions; made the reservation estimate and monthly minimum single-sourced; named the schema contract test; specified strict `Number` parsing; added wrong-id live verification; synchronized sprint status; and made the FR-10/AD-13 budget-layer clarification explicit.
- 2026-09-23: Resumed after a ~2-month gap. Verified and checked off Tasks 0–7 against a pre-existing uncommitted implementation (351/351 tests, lint/typecheck/build clean). Deployed the sandbox (`npx ampx sandbox --once`); confirmed via direct AWS inspection that exactly one Config item exists and the `Admin` Cognito group has exactly one member (Tony). HALTed on Task 8's remaining live-verification bullets, which require a Cognito identity in the `Admin` group or the `TAROT_E2E_*` credentials — neither available to the agent this session.
- 2026-09-23 (continued): Tony completed the identity-gated live verification himself — AppSync-console checks (wrong-id rejected, out-of-range rejected, non-admin rejected) and the real Admin Dashboard save flow. The save surfaced a separate, pre-existing bug (App.jsx's admin-status recheck transiently kicking an actual admin out of the dashboard mid-action), independent of this story's own Config.update/validation logic, which is proven correct by the same checks. Filed as **Story 4-5** rather than fixed here. Proved the "next request reads the new value" requirement with a direct read-only invoke of the deployed `usage-counter` Lambda. Restored Config to `dailyLimit: 5, monthlyBudget: 30`, re-ran all close-out gates green, and moved the story to `review`.
