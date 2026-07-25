---
baseline_commit: 687b9b3
---

# Story 3.8: Make Orientation Guide generation durable and asynchronous

Status: done

## Story

As an authenticated user requesting an Orientation Guide,
I want generation to continue reliably beyond the initiating API response and remain tied to my exact request,
So that I receive the Guide I paid for without timeout ambiguity, duplicate charges, or another Session being mistaken for mine.

*(Correct-course story — created from the approved `sprint-change-proposal-2026-07-19.md`. It replaces the synchronous mutation + newest-Session-polling architecture (3.2/3.3's superseded contracts) with a starter Lambda + version-pinned Lambda Durable Functions worker + exact-Session lifecycle tracking. It gates 3.4 and 3.5; 3.3 stays frozen in review until this story and the retained Results UI pass one integrated review. The 3.3 UI itself — Results screen, loading/error visuals, copy, accessibility — is retained, not rebuilt.)*

## Acceptance Criteria

1. **Given** valid Context, Spread, and a client-generated request ID, **when** the user submits, **then** the starter conditionally creates an owner-readable `PENDING` Session and returns `{ sessionId, status }` within the prompt-acknowledgment target (≤3s) without waiting for Tavily or Bedrock
2. **Given** the same owner, request ID, Context, and Spread are submitted again, **when** the starter handles the duplicate, **then** it returns the existing Session and starts no additional execution; reusing the ID with different inputs returns `IDEMPOTENCY_CONFLICT`
3. **Given** an accepted Session, **when** its version-pinned worker runs, **then** it transitions the Session to `RUNNING`, reads one Config snapshot, atomically reserves usage/spend, draws cards, calls Tavily, calls Bedrock, and transitions the Session to `SUCCEEDED` with the existing result contract
4. **Given** an outright Draw, Tavily, Bedrock, or output-validation failure after reservation and before a successful Bedrock result is checkpointed, **when** the execution terminates, **then** compensation completes idempotently before the Session becomes `FAILED`, and its stable `errorCode` drives the existing user-facing treatment
5. **Given** a successful Bedrock result has been checkpointed but updating the Session transiently fails, **when** the durable worker resumes, **then** it retries persistence from the checkpoint without intentionally calling Bedrock again; the reservation remains because real provider spend occurred, and exhausted persistence retries raise an operational alert rather than falsely reporting compensation
6. **Given** Tavily exceeds 20 seconds, **when** its timeout fires, **then** the durable worker continues to Bedrock without grounding, reaches `SUCCEEDED`, retains `tavilyTimedOut: true`, and does not compensate the reservation
7. **Given** the durable runtime replays or retries any step, **when** state-changing operations execute again, **then** Session creation, reservation, compensation, Bedrock-result persistence, and terminal transitions produce no duplicate usage, spend, or completed Guide
8. **Given** generation is in progress, **when** the client checks completion, **then** it fetches only the returned Session ID; it never lists Sessions, establishes a newest-row baseline, or re-submits because of timeout
9. **Given** an active Session ID has been stored locally, **when** the browser reloads or the app restarts under the same authenticated owner, **then** the application resumes that exact Session, and the ID is cleared on sign-out or deliberate exit from Results
10. **Given** lifecycle changes occur, **when** the client renders them, **then** `PENDING`/`RUNNING` use the existing loading treatment, `SUCCEEDED` renders the existing Results screen, Daily-limit failure degrades to Quick Draw, and other failures use the existing accessible inline messages
11. **Given** Sessions created before lifecycle fields existed, **when** Story 3.8 deploys, **then** they are safely backfilled or unambiguously treated as `SUCCEEDED`; no existing Context, cards, events, or Guide content is lost
12. **Given** a real generation exceeds AppSync's former response boundary, **when** live verification runs, **then** the starter acknowledgment succeeds promptly, the background worker reaches `SUCCEEDED`, the exact Guide renders, and DailyUsage/MonthlySpend each change exactly once; failed and abnormally long executions are observable without logging Context or Guide bodies

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. **This story deploys the sandbox backend repeatedly** — schema change (Session lifecycle fields + new mutation), one new Lambda, one rewritten durable Lambda, version/alias wiring. Valid AWS session at story start and through the live-verification window.
2. **⚠️ The Tavily secret propagation gotcha (3.3's Task 6 HALT) will likely recur.** 3.3 proved that a sandbox deploy with an *unchanged* `secret('TAVILY_API_KEY')` reference can leave a Lambda on a stale secret value; the fix was propagating the stored version-2 value to the Lambda environment directly. The rewritten worker is a **new function resource from CDK's perspective only if its name changes — it keeps the name `orientation-guide`**, so assume the stale-secret risk applies. Task 7 verifies the deployed value in-memory (HTTP 200 from Tavily) before any paid call; if it 401s, the agent will halt and hand you the same propagation step that worked on 2026-07-19.
3. **Real spend, small:** ~3–5 full generations across live verification (~$0.09–$0.15 at $0.03 each) plus near-zero durable checkpoint costs (KB-scale state, 1-day retention). Budgets tripwire still covers the window.
4. **Lambda Durable Functions availability:** the installed toolchain supports it (`durableConfig` in `@aws-amplify/backend-function` 1.18.1, durable APIs in `@aws-sdk/client-lambda` 3.1085.0). Task 0 probes the account/region (us-east-1) with a deploy before any dependent work; if the account can't create durable functions, the agent halts — that's the proposal's "Architect re-enters" trigger, not something to work around.
5. `TAROT_E2E_EMAIL` / `TAROT_E2E_PASSWORD` in the agent's shell (env-only, as always).

## Contract values (frozen for this story — 3.4/3.5 build against them)

| Item | Value |
|---|---|
| Start mutation | `startOrientationGuide(requestId: string!, context: string!, spreadKey: string!)` → `a.json()` ack `{ sessionId, status }` — replaces `generateOrientationGuide`, which is **removed** from the schema in this story. String-parse guard applies (house rule) |
| Request ID | client-generated `crypto.randomUUID()`; it is simultaneously the `requestId`, the Session `id`, and the durable execution name (spine Consistency Conventions) |
| Session lifecycle | `status: PENDING | RUNNING | SUCCEEDED | FAILED` (a.enum), `errorCode: a.string()`, `completedAt: a.datetime()` — result fields (`cards`, `currentEvents`, `guide`, `tavilyTimedOut`) stay optional until `SUCCEEDED`. Missing `status` (legacy row) ⇒ `SUCCEEDED` (AC 11) |
| Error codes | existing `DAILY_LIMIT_EXHAUSTED`, `MONTHLY_BUDGET_EXHAUSTED`, `GENERATION_FAILED` (now delivered via `Session.errorCode` on `FAILED`) + new starter-thrown `IDEMPOTENCY_CONFLICT`. Match with `.includes()`, never `===` |
| Worker invocation | `InvokeCommand` with `InvocationType: 'Event'`, `DurableExecutionName: sessionId`, `FunctionName` = **qualified alias ARN** (`…:function:…:live`) — unqualified ARNs are rejected for durable functions; `$LATEST` is banned in this project (AD-11) |
| Worker input | `{ sessionId }` and nothing else — Context/Spread load from the owner-bound Session record (AD-19) |
| Worker durable config | `durableConfig: { executionTimeoutSeconds: 300, retentionPeriodDays: 1 }`; per-invocation `timeoutSeconds: 60` stays |
| Alias | name `live`, pointing at `currentVersion`; the starter invokes only through it |
| Reservation/compensation tokens | ⚠️ **Deviation from the spine's literal text, intent preserved:** AD-6 says `sessionId:reserve` / `sessionId:rollback`, but DynamoDB `ClientRequestToken` is capped at **36 characters** and a UUID is already 36 — the literal form (43/44 chars) would be rejected. Use `sessionId.replace(/-/g, '') + 'RES'` and `… + 'RBK'` (35 chars, deterministic, distinct). Record this in the completion notes as an architecture erratum for Tony |
| Replay-proof counter guard | both counter transactions gain a third item: a conditional update on the Session row itself (`usageReservedAt` on reserve, `usageCompensatedAt` on rollback — plain DynamoDB attributes, NOT schema fields). This is what makes reserve/rollback idempotent **beyond** DynamoDB's 10-minute token window, which durable retries can outlive (AC 7) |
| Client poll | `Session.get(sessionId)` every 5s; client deadline 300s aligned to `executionTimeoutSeconds` (after that the execution is dead by definition → generic failure treatment, active ID cleared) |
| Active-ID storage | `localStorage` key `tarotSpaActiveOrientationSession`; cleared on sign-out, deliberate exit from Results, and terminal failure handling |
| Ack latency target | ≤3s (revised NFR5); measure and record actual |
| New devDependencies | `@aws/durable-execution-sdk-js`, `@aws/durable-execution-sdk-js-testing`, `@aws-sdk/client-lambda` (bundled into the starter like `client-bedrock-runtime` was for 3.2) |

## Copy

**No new user-facing copy.** Every state this story renders reuses a 3.3 string byte-exact: `Reading the cards and the world...` (loading, now also PENDING/RUNNING and resume), the generation-failed inline error, the monthly-ceiling inline error, the rate-limit degrade, the Tavily-timeout note, `← Back`. `IDEMPOTENCY_CONFLICT` and the 300s client deadline render the existing generation-failed copy (unclassified failure family). If you find yourself writing a new string, stop — it's out of scope or belongs in the completion notes flagged for Tony.

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight + durable-capability probe** (AC: none — gate)
  - [x] Baseline gates green: `npm test` (148 at 3.3 close — establish the real number), `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e` with and without credentials.
  - [x] AWS session valid; record current sandbox state (Config values, test-account DailyUsage today UTC, MonthlySpend this month, Session row count) — Task 7 restores/reconciles.
  - [x] **Durable probe:** add `durableConfig: { executionTimeoutSeconds: 300, retentionPeriodDays: 1 }` to `amplify/functions/orientation-guide/resource.ts` and `npx ampx sandbox --once`. A clean deploy proves account/region/toolchain support end-to-end before any dependent code exists. If it fails, HALT and report — architect trigger per the proposal.
  - [x] Confirm `TAVILY_API_KEY` still passes live (in-memory check, HTTP 200, value never printed) — the 3.3 stale-secret gotcha; if 401, HALT for Tony.
- [x] **Task 1: Schema + dependencies** (AC: 1, 2, 11)
  - [x] `package.json`: add the three devDependencies from the contract table.
  - [x] `amplify/data/resource.ts` Session model: add `status: a.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'])`, `errorCode: a.string()`, `completedAt: a.datetime()`. Auth rule unchanged — owner-read-only via bare-`sub`; the browser can never write Session in any lifecycle state (AD-9). Do NOT add `usageReservedAt`/`usageCompensatedAt` to the schema — they are worker-internal DynamoDB attributes, invisible to GraphQL by design.
  - [x] Replace the `generateOrientationGuide` custom mutation with `startOrientationGuide: a.mutation().arguments({ requestId: a.string().required(), context: a.string().required(), spreadKey: a.string().required() }).returns(a.json()).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(startOrientationGuide))`. `getOrientationStatus` is untouched.
- [x] **Task 2: Starter Lambda — `amplify/functions/start-orientation-guide/`** (AC: 1, 2)
  - [x] `resource.ts`: `defineFunction({ name: 'start-orientation-guide', resourceGroupName: 'data', timeoutSeconds: 10 })` — no secrets, no Bedrock; this function must stay boring and fast.
  - [x] `handler.ts` — `createHandler(deps)` DI shape (house pattern; deps: `{ dynamo, lambda (LambdaClient), tableNames, workerFunctionArn, now }`), caller from `event.identity.sub` (never client-supplied). Flow:
    1. **Validate before any write** (moved verbatim from the current worker handler — same trims, same 10 000-char ceiling, same `Object.hasOwn(SPREADS, spreadKey)` inherited-key guard, same error behavior): plus `requestId` must match a strict UUID regex — it becomes a durable execution name and a DynamoDB key; reject anything else before touching state.
    2. **Conditional create:** `PutCommand` `{ id: requestId, owner: accountId, spreadKey, context, status: 'PENDING', createdAt, updatedAt }` with `ConditionExpression: 'attribute_not_exists(id)'`.
    3. **On ConditionalCheckFailed:** `GetCommand` the row. Same `owner` AND same `context` AND same `spreadKey` → this is the idempotent-duplicate path: return `{ sessionId, status: existing.status }` AND re-issue the async invoke (next step) with the identical name/payload — Lambda's execution-name idempotency returns the existing execution without starting a duplicate (verified behavior: identical name + identical payload = idempotent start), and the re-invoke heals the crashed-between-create-and-invoke gap. Any mismatch (owner or inputs) → `throw new Error('IDEMPOTENCY_CONFLICT')`.
    4. **Invoke the worker:** `InvokeCommand({ FunctionName: deps.workerFunctionArn, InvocationType: 'Event', DurableExecutionName: requestId, Payload: JSON.stringify({ sessionId: requestId }) })`. Treat `DurableExecutionAlreadyStartedException` as success (the execution exists — that is the goal). ⚠️ The payload for a given requestId is byte-identical by construction, which is what keeps every re-invoke in the idempotent row of Lambda's behavior table.
    5. Return `{ sessionId: requestId, status: 'PENDING' }` (object; AppSync serializes for `a.json()`).
  - [x] `handler.test.ts` — DI mocks: happy path (Session created THEN invoke, with `DurableExecutionName` = requestId and the qualified ARN); validation rejections write nothing and invoke nothing; identical duplicate → existing status returned, no second Put, invoke re-issued; input mismatch → `IDEMPOTENCY_CONFLICT`, no invoke; owner mismatch → `IDEMPOTENCY_CONFLICT`; `DurableExecutionAlreadyStartedException` from invoke → still acks normally; malformed requestId rejected.
- [x] **Task 3: Worker rewrite — durable `amplify/functions/orientation-guide/`** (AC: 3, 4, 5, 6, 7)
  - [x] `resource.ts`: keep name `orientation-guide`, `resourceGroupName: 'data'`, `timeoutSeconds: 60`, `TAVILY_API_KEY` secret; add the `durableConfig` from Task 0's probe.
  - [x] `handler.ts`: `import { withDurableExecution } from '@aws/durable-execution-sdk-js'`; `export const handler = withDurableExecution(createHandler())` — keep the `createHandler(deps)` DI shape with step *bodies* as plain named inner functions over `deps` so they stay unit-testable outside the durable runtime. **Determinism rules:** no `Date`, `Math.random`, or `randomUUID` outside step bodies — all timestamps and the draw happen inside checkpointed steps; on replay the SDK returns the checkpointed results.
  - [x] Durable flow, each state change its own named `context.step(...)`:
    1. `load-session`: Get Session by `event.sessionId`. Missing → throw (loud; starter always creates first). Already `SUCCEEDED`/`FAILED` → return immediately (replay/duplicate-start guard — AC 7).
    2. `mark-running`: conditional UpdateItem `status: PENDING → RUNNING` (`ConditionExpression: '#s IN (:pending, :running)'` — re-running it is a no-op, not an error).
    3. `read-config`: existing `readConfig` — the step checkpoint IS AD-13's "checkpointed snapshot"; replays reuse it, never re-read.
    4. `reserve`: existing `reserveUsage` extended per the contract table — three-item transaction (MonthlySpend item 0, DailyUsage item 1, Session-marker item 2 conditional on `attribute_not_exists(usageReservedAt)`), token `sessionIdNoDashes + 'RES'`. Cancellation mapping: reason 0 → `MONTHLY_BUDGET_EXHAUSTED` (global-stop precedence, unchanged), reason 1 → `DAILY_LIMIT_EXHAUSTED`, reason 2 alone → already reserved on a prior attempt → treat as success and continue. Limit-exhausted outcomes skip compensation (nothing was reserved) and go straight to `mark-failed` with that code.
    5. `draw`: `drawCards(...)` + position zip, inside the step (Math.random is checkpointed this way). Failure → compensation path.
    6. `tavily`: the existing fetch/timeout/triage logic moved inside one step — 20s `AbortController` timeout INSIDE the step returning `{ currentEvents: [], tavilyTimedOut: true }` as a successful step result (AC 6); degraded/malformed results filtered as today; outright failure throws out of the step → compensation path. ⚠️ Configure this step (and `bedrock`) with **no automatic step retries** — AD-6's semantics are "outright failure → compensate", not "retry until it works"; a retried Tavily is a behavior change, a retried Bedrock is double spend.
    7. `bedrock`: the existing ConverseCommand + `end_turn` + non-blank validation inside one step, with a fixed 50s `AbortController` (fail cleanly inside the invocation instead of letting the invocation die mid-step, which would force an at-least-once re-execution — the one crash window that can double Bedrock spend; accepted residual risk, note it). Failure/invalid output → compensation path. On success the essay is **checkpointed** — this is AC 5's anchor.
    8. `persist-result`: single UpdateItem on Session — set `cards` (lean `{name, position, inverted}` shape, unchanged), `currentEvents`, `guide`, `tavilyTimedOut`, `status: 'SUCCEEDED'`, `completedAt`, `updatedAt`, conditional `status = RUNNING` (a conditional miss here means a replay already persisted → success). Give THIS step retries (it's idempotent and cheap). If retries exhaust: log the operational alert line `ORIENTATION_GUIDE_PERSISTENCE_FAILED <sessionId>` (id only — never content) and rethrow WITHOUT compensation — spend happened, AC 5; the Session parks in `RUNNING` and the client's 300s deadline plus `ListDurableExecutions` observability cover it.
    9. **Compensation path** (draw/tavily/bedrock outright failures only): `compensate` step — `rollbackUsage` with token `…'RBK'` and the Session-marker item conditional on `attribute_exists(usageReservedAt) AND attribute_not_exists(usageCompensatedAt)` (a marker miss = already compensated = success); then `mark-failed` step — conditional UpdateItem `status → FAILED`, `errorCode`, `completedAt` (condition `status = RUNNING`). Compensation ALWAYS precedes `FAILED` (AC 4's ordering).
  - [x] Delete the superseded machinery from the old handler: the `getRemainingTimeInMillis` margin bookkeeping and pre-launch guards (the durable runtime + per-step aborts replace them), and the pre-return payload assembly for AppSync (the worker returns nothing to a caller). The prompt, Tavily query builder, validation values, and result shapes move over **verbatim** — 3.2's supersession note is explicit about what is retained; do not "improve" the prompt or triage logic in passing.
  - [x] `amplify/functions/usage-counter/reservation.ts` + tests: extend `reserveUsage`/`rollbackUsage` for the third Session-marker item, the new token derivation, and the reason-2/already-applied mappings. Preserve every existing condition and the monthly-first precedence — the 3.2 review rounds hardened these; only ADD.
  - [x] Worker tests: unit-test the step bodies directly via DI (all the 3.2 scenarios carry over: triage, rollback, prompt shape, malformed Tavily entries, blank essay…), PLUS `@aws/durable-execution-sdk-js-testing`'s `LocalDurableTestRunner` for lifecycle coverage: happy path reaches `SUCCEEDED` with exactly one reservation; limit-exhausted → `FAILED` + code, zero compensation; provider failure → compensated exactly once, then `FAILED`; Tavily timeout → `SUCCEEDED` + `tavilyTimedOut`; re-run of a completed execution's steps produces no second reservation (marker-item guard). If the local runner fights the DI shape, the fallback is step-body unit tests plus marker-item idempotency tests — but attempt the runner first and record which path was taken.
- [x] **Task 4: `amplify/backend.ts` wiring** (AC: 1, 3)
  - [x] Add `startOrientationGuide` to `defineBackend` and the import list.
  - [x] Worker grants: change `sessionTable.grantWriteData(orientationGuideLambda)` → `grantReadWriteData` (the worker now reads the Session for its input); everything else (DailyUsage/MonthlySpend RW, Config R, Bedrock policy, table-name envs) stays.
  - [x] **Version + alias:** `const workerVersion = orientationGuideLambda.currentVersion;` `const workerAlias = new Alias(dataStack, 'OrientationGuideLive', { aliasName: 'live', version: workerVersion });` (`aws-cdk-lib/aws-lambda`). Durable invocation REQUIRES a qualified identifier, and AD-11 bans `$LATEST` in production; in-flight executions keep their pinned version when the alias moves.
  - [x] Starter grants + env: `sessionTable.grantReadWriteData(startOrientationGuideLambda)`; `SESSION_TABLE_NAME`; `workerAlias.grantInvoke(startOrientationGuideLambda)` (grants on the alias-qualified ARN only — the starter cannot invoke `$LATEST` or bare versions); env `ORIENTATION_GUIDE_FUNCTION_ARN = workerAlias.functionArn`. All same-stack (`resourceGroupName: 'data'`) — none of the SSM cross-stack machinery applies; don't copy it.
- [x] **Task 5: Legacy Session backfill — `scripts/backfill-session-status.mjs`** (AC: 11)
  - [x] Mirror `scripts/seed-config.mjs` structure/CLI conventions (read it first). Scan the Session table; for every item with no `status` attribute: conditional UpdateItem (`attribute_not_exists(#s)`) setting `status: 'SUCCEEDED'` and `completedAt = updatedAt`. Idempotent — rerunning is a no-op; touches nothing else, loses nothing (AC 11). Add `"backfill-sessions"` to package.json scripts.
  - [x] Defense in depth on the client (Task 6): `status ?? 'SUCCEEDED'` guard when reading a Session — the backfill makes data unambiguous, the guard makes code unambiguous; both are cheap.
  - [x] Record in deferred-work.md: run once per environment when this schema first reaches staging/main (same protocol as seed-config).
- [x] **Task 6: Frontend — exact-Session tracking replaces newest-Session recovery** (AC: 1, 8, 9, 10)
  - [x] `src/utils/orientation.js`: keep `getOrientationStatus` untouched. **Delete `getNewestSession` and `generateOrientationGuide`** (the freeze note prohibits the newest-Session path surviving). Add, same thin style: `startOrientationGuide(requestId, context, spreadKey)` → `client.mutations.startOrientationGuide({...})`, throw on errors, string-parse guard; `getSession(sessionId)` → `client.models.Session.get({ id: sessionId })`, return `null` when absent, string-parse guards on `cards`/`currentEvents`, and apply the `status ?? 'SUCCEEDED'` legacy guard. Update `src/utils/orientation.test.js` accordingly.
  - [x] `src/App.jsx` — App owns the whole orientation lifecycle (submit AND resume run through one path; the house rule "App-wide state owned by App.jsx" now genuinely requires it, because a reload-resume cannot originate from a ContextEntry submit await):
    - New state: `orientBusy` (bool), `orientError` (string|null). `guideResult` stays as-is (3.4's seam).
    - `followSession(sessionId)`: poll `getSession(sessionId)` every 5s (settle immediately on the first read if already terminal). `SUCCEEDED` → build the result object exactly as today (`{ spreadKey, context, sessionId, cards, currentEvents, guide, tavilyTimedOut }` from the Session record — the rehydration/rendering path is untouched 3.3 code) → `showGuideResult(...)` (which already refreshes the rate-limit flag), keep the active ID stored (reload-after-success restores Results, per updated EXPERIENCE.md). `FAILED` → clear the active ID, then map `errorCode`: `DAILY_LIMIT_EXHAUSTED` → `setRateLimited(true)` (degrade, no error text); anything else → `setOrientError(errorCode)` (ContextEntry renders monthly vs generic exactly as today). Still `PENDING`/`RUNNING` at the 300s deadline → clear the active ID, `setOrientError('GENERATION_FAILED')`. Poll loop must be cancel-safe (sign-out mid-poll must stop it — cleanup rule in project-context).
    - `handleOrient(context, spreadKey)` (no longer awaited by ContextEntry): `setOrientError(null); setOrientBusy(true);` generate `requestId = crypto.randomUUID()`, store it in `localStorage` under the contract key **before** the mutation (ambiguity insurance), call `startOrientationGuide`. Ack OK → `followSession(requestId)`. Mutation throws: `.includes('IDEMPOTENCY_CONFLICT')` → treat as generic failure (UUIDs make this near-impossible; do not build UI for it); any other throw → **ambiguous acknowledgment protocol (updated EXPERIENCE.md):** `getSession(requestId)` — a Session exists → the start actually landed → `followSession(requestId)`; `null` → the start never happened → clear the active ID, `setOrientError` generic; the NEXT submission generates a fresh UUID. Never regenerate an ID while its Session might exist; never resubmit because an ack was lost (AC 8). `finally`-style: `setOrientBusy(false)` only when the flow reaches a terminal outcome (Results, degrade, or error) — busy spans the whole PENDING/RUNNING window.
    - **Resume effect** (AC 9): in the authenticated effect, read the stored active ID; if present, `setOrientBusy(true)` + `followSession(storedId)` — reload during `PENDING`/`RUNNING` re-enters loading; after `SUCCEEDED` it restores that exact Session's Results. `getSession` returning `null` (signed in as a different owner — owner-read hides it, or the row is gone) → clear the ID silently, normal Context Entry.
    - Clearing set: `handleSignedOut` and the Results `onBack` both clear the stored ID (plus existing state resets). Terminal-failure paths clear it in `followSession`.
  - [x] `src/components/ContextEntry.jsx` — busy/error become **controlled props** (`orientBusy = false`, `orientError = null`) replacing the 3.3 local `busy`/`orientError` state; `handleSubmit` calls `onOrient(context.trim(), spreadKey)` fire-and-forget (no await, no local try/catch). Everything the user sees is IDENTICAL: same disabled logic (`orientBusy || !context.trim() || !spreadKey`), same `role="status"` loading line and copy, same `role="alert"` classification (`includes('MONTHLY_BUDGET_EXHAUSTED')` → monthly copy, else generic), same markup and classes. This is re-plumbing, not redesign — the freeze note's "existing UX and accessible state treatment remain intact" is AC 10.
  - [x] Tests:
    - `ContextEntry.test.jsx`: convert the 3.3 busy/error tests to drive the new props; every visible assertion (copy, roles, disabled states, retained Context/Spread) survives verbatim. 3.1-era assertions untouched.
    - `AppAuth.test.jsx`: rework the orientation mock to `{ startOrientationGuide, getSession, getOrientationStatus }`. Cover, with fake timers where polling is involved: (a) submit → ack → poll transitions PENDING→SUCCEEDED → Results renders, mutation called exactly once, `localStorage` key set then retained; (b) `FAILED` + `DAILY_LIMIT_EXHAUSTED` → Rate-Limited Intake, no alert, active ID cleared; (c) `FAILED` + `MONTHLY_BUDGET_EXHAUSTED` → monthly inline copy, Context preserved; (d) ack throws + `getSession` finds the Session → polling continues to Results with NO second mutation call (ambiguity protocol pinned); (e) ack throws + `getSession` null → generic error, active ID cleared, next submit uses a NEW UUID (assert two distinct requestIds); (f) 300s deadline with a never-terminal Session → generic error + ID cleared; (g) **resume**: pre-seed `localStorage` + `getSession` resolving `SUCCEEDED` → Results renders with zero mutation calls; resume with `RUNNING` → loading line visible; (h) sign-out and Results-`← Back` both clear the stored key; (i) legacy Session (no `status`) renders as Results (the `?? 'SUCCEEDED'` guard). The old baseline/newest-Session tests are **deleted with cause** (superseded architecture — cite the freeze note in the story record, honoring the never-delete-coverage-silently rule).
    - No always-on generation e2e, unchanged. Existing Playwright suites must stay green in both credential modes.
- [x] **Task 7: Deploy, backfill, live verification** (AC: 1, 2, 3, 6, 9, 11, 12 — outcome-phrased)
  - [x] `npx ampx sandbox --once` (schema + starter + durable worker + alias). Then `npm run backfill-sessions` → every pre-existing Session row shows `status: SUCCEEDED`, content intact (spot-check one row's guide text length before/after — AC 11). Run it twice — second run is a clean no-op.
  - [x] **Tavily secret in-memory probe** (pre-req #2) BEFORE any paid call — 200 or HALT.
  - [x] **The headline flow (AC 1, 3, 12):** real UI submit as the test account. Outcomes: the ack returns fast — **record the measured ack latency** (target ≤3s, NFR5); the loading line holds while the Session moves PENDING→RUNNING→SUCCEEDED; Results renders the exact Guide (~30s total, record it); DailyUsage +1 exactly, MonthlySpend +0.03 exactly. The AppSync 30s boundary is now irrelevant to the user — no error flash, no recovery, `startOrientationGuide` returned long before.
  - [x] **Reload resume (AC 9):** submit again; reload the browser mid-`RUNNING` → the app returns to the loading state and lands on the SAME Session's Results (compare sessionId), with counters +1/+0.03 for this submission — not +2. Then reload after Results → Results restores. `← Back` → reload → normal Context Entry (ID cleared).
  - [x] **Duplicate-start idempotency (AC 2):** scripted (scratchpad, env creds): call `startOrientationGuide` twice with the same requestId/context/spreadKey in quick succession → same `sessionId` back, ONE Session row, ONE durable execution (`aws lambda list-durable-executions --function-name orientation-guide:live` filtered by the name), counters move once. Then once more with the same requestId but different context → `IDEMPOTENCY_CONFLICT`, nothing new created.
  - [x] **Limit paths via lifecycle (AC 4-adjacent, live):** set `dailyLimit` = used count → UI submit → brief loading, then Rate-Limited Intake (FAILED + code path), MonthlySpend unchanged. Monthly: `spent = monthlyBudget`, dailyLimit restored → submit → monthly inline message, Context preserved. Restore Task 0 state afterward and run one final healthy generation.
  - [x] **Observability without leakage (AC 12):** `aws lambda get-durable-execution` / CloudWatch for the story's executions — status visible, and the worker's log lines contain sessionIds/codes only. Grep the log output for a distinctive phrase from the submitted test Context → zero hits.
  - [x] Compensation/persistence-failure paths are unit/runner-verified (Task 3), not live-forced (breaking Bedrock live corrupts config — same call as 3.2/3.3); say so explicitly in the record.
  - [x] Both Playwright modes green, untouched.
- [x] **Task 8: Close out (Definition of Done)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
  - [x] deferred-work.md: staging/main need (a) `npm run backfill-sessions` once when this schema first deploys there, (b) awareness that the `live` alias auto-tracks `currentVersion` per deploy while in-flight executions finish on their pinned version.
  - [x] Completion notes must record: measured ack latency + end-to-end latency (NFR5 evidence), the ClientRequestToken-length architecture erratum (spine AD-6's literal token format vs. the implemented 35-char derivation) for Tony to fold into the spine, and which worker-test path was used (LocalDurableTestRunner vs. step-body fallback).
  - [x] Credential/content sweep: no Tavily/test-account values anywhere; no real Context/Guide bodies in artifacts or logs cited in the record; `playwright/.auth/` untracked.
  - [x] Commit and push to `main`. Story → review, and note that the NEXT step per the proposal is the **integrated review of 3.8 + 3.3's retained UI together** — not a standalone 3.3 review, and not 3.4 work.

### Review Findings

- [x] [Review][Patch] Retry the starter once with the identical request ID and inputs when ambiguous recovery finds the exact Session still PENDING, healing the write/invoke gap without generating a new ID [amplify/functions/start-orientation-guide/handler.ts:98]
- [x] [Review][Patch] Raise the worker Lambda timeout to 90 seconds so the 20-second Tavily and 50-second Bedrock budgets fit with checkpoint and persistence overhead [amplify/functions/orientation-guide/resource.ts:6]
- [x] [Review][Patch] Add a CloudWatch worker-error alarm without notification actions; persistence exhaustion rethrows and retains its distinctive `ORIENTATION_GUIDE_PERSISTENCE_FAILED` log line for diagnosis [amplify/functions/orientation-guide/handler.ts:484]
- [x] [Review][Patch] Make reservation and compensation transaction parameters replay-identical for deterministic client tokens [amplify/functions/orientation-guide/handler.ts:207]
- [x] [Review][Patch] Roll back the exact UTC day and month that were originally reserved [amplify/functions/orientation-guide/handler.ts:355]
- [x] [Review][Patch] Recognize an existing Session reservation before newly exhausted quota conditions on replay [amplify/functions/usage-counter/reservation.ts:186]
- [x] [Review][Patch] Use a strongly consistent read when classifying a conditional-create duplicate [amplify/functions/start-orientation-guide/handler.ts:115]
- [x] [Review][Patch] Reconcile Config and non-limit reservation failures instead of leaving Sessions permanently RUNNING [amplify/functions/orientation-guide/handler.ts:422]
- [x] [Review][Patch] Do not start fresh executions for terminal or stale RUNNING duplicates after durable-name retention expires, including already-compensated Sessions [amplify/functions/start-orientation-guide/handler.ts:130]
- [x] [Review][Patch] Restore the deployed sandbox worker's current Tavily secret value and verify the credential-safe in-memory probe returns HTTP 200 before any paid generation
- [x] [Review][Patch] Cover changed-spread idempotency conflicts in the starter suite so request identity is proven across owner, Context, and Spread [amplify/functions/start-orientation-guide/handler.test.ts:185]
- [x] [Review][Patch] Prove non-idempotency worker invocation failures propagate instead of falsely acknowledging an orphaned PENDING Session [amplify/functions/start-orientation-guide/handler.test.ts:208]
- [x] [Review][Patch] Exercise Bedrock rejection, incomplete output, and blank output through the durable lifecycle, proving compensation completes before GENERATION_FAILED [amplify/functions/orientation-guide/handler.test.ts:220]
- [x] [Review][Patch] Exercise compensation exhaustion through the durable worker and prove mark-failed is not attempted while accounting remains reserved [amplify/functions/orientation-guide/handler.test.ts:220]
- [x] [Review][Patch] Drive the real 20-second Tavily AbortController timer rather than injecting an immediate AbortError [amplify/functions/orientation-guide/handler.test.ts:239]
- [x] [Review][Patch] Prove an already FAILED Session returns before reservation or provider work, matching the terminal SUCCEEDED guard [amplify/functions/orientation-guide/handler.test.ts:288]
- [x] [Review][Patch] Restore retained Tavily request-contract assertions for endpoint, authorization, method, topic, search depth, and result limit [amplify/functions/orientation-guide/handler.test.ts:320]
- [x] [Review][Patch] Restore structural JSON-evidence and system-prompt assertions so prompt-injection protections cannot regress behind substring checks [amplify/functions/orientation-guide/handler.test.ts:352]
- [x] [Review][Patch] Strengthen lifecycle update mocks and replay tests to verify the Session table/key/status conditions for RUNNING, SUCCEEDED, and FAILED writes [amplify/functions/orientation-guide/handler.test.ts:104]
- [x] [Review][Patch] Prove an already-compensated replay wins over simultaneous counter-condition misses during rollback [amplify/functions/usage-counter/reservation.test.ts:235]
- [x] [Review][Patch] Retry transient exact-Session read failures until the request deadline instead of treating an undefined Session as legacy success [src/App.jsx:139]
- [x] [Review][Patch] Keep the active request ID through ambiguous-ack lookup failures and preserve the same-ID PENDING healing retry after recovery [src/App.jsx:237]
- [x] [Review][Patch] Start the 300-second deadline before the starter call and bound starter and polling reads so unresolved network promises cannot leave loading indefinitely [src/App.jsx:135]
- [x] [Review][Patch] Keep PENDING/RUNNING loading visible above rate-limit and Quick Draw branches, and prevent deliberate Quick Draw while generation is active [src/components/ContextEntry.jsx:29]
- [x] [Review][Patch] Track and cancel the active poll wait during sign-out, effect cleanup, and flow replacement [src/App.jsx:188]
- [x] [Review][Patch] Restore the stored Session Context when a resumed request reaches FAILED so the retained retry copy remains true after reload [src/App.jsx:170]
- [x] [Review][Patch] Validate a SUCCEEDED or legacy Session's result shape before rendering Results, converting malformed records into the controlled generic failure [src/App.jsx:155]
- [x] [Review][Patch] Guard the post-success rate-limit refresh against sign-out and newer authentication or orientation flows [src/App.jsx:122]
- [x] [Review][Patch] Clear only the displayed result's Session ID on Back so another tab's newer recovery handle is not deleted [src/App.jsx:293]

- [x] [Review][Patch] Treat the 300-second boundary as a recoverable indeterminate state: stop active polling, retain the exact Session ID for later recovery, and show truthful timeout copy that does not claim usage was untouched [src/App.jsx:223]
- [x] [Review][Patch] Attach an SNS/email action to the exhausted-persistence alarm, assign Tony as owner, and document the response runbook without exposing Session content [amplify/backend.ts:63]
- [x] [Review][Patch] Define an alarm-backed parked-`RUNNING` reconciliation exception for persistence/compensation exhaustion, including Tony ownership, response SLA/runbook, and downstream metrics/Story 3.5 handling [_bmad-output/planning-artifacts/architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md:174]
- [x] [Review][Patch] Complete AC 12 with a safe deployed synthetic failure that reserves then compensates before provider spend, recording exact-Session, durable-execution, counter, and alarm evidence without logging sensitive content [_bmad-output/implementation-artifacts/3-8-make-orientation-guide-generation-durable-and-asynchronous.md:303]

- [x] [Review][Patch] Prove Tavily timeout success and Tavily/Bedrock no-retry behavior through the durable lifecycle, including a real 50-second Bedrock abort, one provider attempt, compensation ordering, and no downstream provider call after Tavily failure [amplify/functions/orientation-guide/handler.test.ts:230]
- [x] [Review][Patch] Pin the complete successful persisted result contract, including spread-driven draw count/positions, lean cards, normalized Current Events metadata/truncation, and terminal timestamps [amplify/functions/orientation-guide/handler.test.ts:186]
- [x] [Review][Patch] Exercise monthly-only and simultaneous monthly/daily cancellation through the durable lifecycle, proving monthly precedence and zero provider/compensation work [amplify/functions/orientation-guide/handler.test.ts:213]
- [x] [Review][Patch] Strengthen reservation/rollback assertions and lifecycle fakes to verify the complete three-item transaction contract, exact mutation values, and transaction attempt counts [amplify/functions/usage-counter/reservation.test.ts:70]
- [x] [Review][Patch] Prove rollback retries reuse a byte-identical transaction and compensation token after ambiguous transient failures [amplify/functions/usage-counter/reservation.test.ts:201]
- [x] [Review][Patch] Cover starter configuration, generic Put, and duplicate Get failures, proving no worker invocation and no write after preflight configuration failure [amplify/functions/start-orientation-guide/handler.test.ts:76]
- [x] [Review][Patch] Cover missing/corrupt worker Sessions and assert Config failure never reaches reservation, counters, or providers [amplify/functions/orientation-guide/handler.test.ts:348]
- [x] [Review][Patch] Guard the initial aggregate-limit response with the orientation flow identity so stale status cannot undo a newer Daily-limit failure or hide a monthly/generation error [src/App.jsx:153]
- [x] [Review][Patch] Treat a null exact-Session read after an acknowledged or ambiguous start as a bounded same-ID recovery state instead of immediately permitting a fresh UUID and possible duplicate paid execution [src/App.jsx:254]
- [x] [Review][Patch] Add a synchronous in-flight submission guard and rapid double-submit test so two events before React rerenders cannot mint two request IDs [src/App.jsx:347]
- [x] [Review][Patch] Centralize safe localStorage access and cover denied get/set/remove plus sign-out during a pending Session read without stale UI updates [src/App.jsx:35]
- [x] [Review][Patch] Preserve safe Session Context when `getSession` classifies a resumed SUCCEEDED record as malformed, then verify the real utility rejection path restores it [src/utils/orientation.js:55]
- [x] [Review][Patch] Enforce exact Session ID and allowed lifecycle values before every status branch, normalize blank failure codes, and strengthen completed-result element/card-count validation [src/utils/orientation.js:43]
- [x] [Review][Patch] Restore the resumed Session's Spread as well as Context after terminal failure so the retained UX retry state is truthful [src/App.jsx:285]
- [x] [Review][Patch] Replace invalid canonical `sessionId:reserve` / `sessionId:rollback` guidance with the deployed 35-character UUID-without-dashes plus `RES`/`RBK` derivation [_bmad-output/project-context.md:77]
- [x] [Review][Patch] Supersede the story's stale 60-second worker timeout contract with the reviewed and deployed 90-second value [_bmad-output/implementation-artifacts/3-8-make-orientation-guide-generation-durable-and-asynchronous.md:50]
- [x] [Review][Patch] Reconcile duplicate-start and ambiguous-ack documentation with the final status-aware matrix: same-ID heal only for PENDING; never restart RUNNING, terminal, legacy, or compensated Sessions [_bmad-output/implementation-artifacts/3-8-make-orientation-guide-generation-durable-and-asynchronous.md:79]
- [x] [Review][Patch] Make alias-qualified Tavily probing after every worker deploy the canonical prerequisite and explicitly reject unqualified `$LATEST` evidence [_bmad-output/implementation-artifacts/3-8-make-orientation-guide-generation-durable-and-asynchronous.md:35]
- [x] [Review][Patch] Reconcile stale planning contracts for Tavily's up-to-three/zero-on-timeout results, failed-Session Context/Spread retention, current durable latency, and Amplify's root `/` base [_bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/prd.md:63]
- [x] [Review][Patch] Record verification for the already-checked backend-test/frontend review patches, or return those items to unchecked until focused/full tests, lint, typecheck, build, and browser gates are evidenced [_bmad-output/implementation-artifacts/3-8-make-orientation-guide-generation-durable-and-asynchronous.md:150]
- [x] [Review][Patch] Replace stale forward-looking migration and pre-correction completion notes with append-only superseding evidence that distinguishes sandbox verification from outstanding staging/main rollout [_bmad-output/implementation-artifacts/3-8-make-orientation-guide-generation-durable-and-asynchronous.md:298]

- [x] [Review][Defer] Validate Config numbers as finite, positive, and appropriately integral/ranged rather than accepting every JavaScript `number` [amplify/functions/usage-counter/reservation.ts:18] — deferred, pre-existing
- [x] [Review][Defer] Refresh Daily-limit UI state at the next UTC-day boundary for tabs left open overnight [src/App.jsx:153] — deferred, pre-existing

#### Runtime and infrastructure re-review — 2026-07-22

- [x] [Review][Decision] Choose the recovery guarantee for an accepted Session stranded in `PENDING` — selected an automated reconciler that detects stale Sessions, inspects the named durable execution, dispatches missing work, and terminalizes closed failures [amplify/functions/start-orientation-guide/handler.ts:98]
- [x] [Review][Decision] Align durable-history retention with the reconciliation SLA — selected seven-day checkpoint retention to cover weekends while preserving the documented one-business-day response window [amplify/functions/orientation-guide/resource.ts:9]

- [x] [Review][Patch] Alarm on `DurableExecutionFailed` and `DurableExecutionTimedOut` in addition to standard invocation `Errors`, so exhausted persistence, compensation failure, and the 300-second execution boundary notify Tony at the durable-execution level [amplify/backend.ts:71] — implemented and deployed
- [x] [Review][Patch] Attach and monitor a dead-letter queue for asynchronously invoked durable executions so terminal `FAILED`, `STOPPED`, and `TIMED_OUT` events retain their Session-ID payload for reconciliation [amplify/backend.ts:64] — implemented and deployed
- [x] [Review][Patch] Narrow starter and worker Session-table IAM from broad read/write grants to the exact `GetItem`/`PutItem` and `GetItem`/`UpdateItem` actions they execute [amplify/backend.ts:107] — implemented and deployed
- [x] [Review][Patch] Add operation-scoped admission throttling for authenticated `startOrientationGuide` calls so exhausted or compromised accounts cannot create unlimited Session rows and durable executions before counter enforcement [amplify/backend.ts:255] — implemented and deployed
- [x] [Review][Patch] Reject blank/whitespace Tavily titles and content in the worker so a paid `SUCCEEDED` result cannot be rejected as malformed by the stricter client validator [amplify/functions/orientation-guide/handler.ts:173] — implemented and covered
- [x] [Review][Patch] Add dead-letter/error monitoring for the SNS-to-SES alert path so failure of the notification Lambda does not silently discard the sole operational page [amplify/backend.ts:69] — implemented and deployed
- [x] [Review][Patch] Implement the selected automated reconciler for stale `PENDING` Sessions, including exact durable-execution inspection, safe missing-work dispatch, and terminalization of closed failures [amplify/functions/start-orientation-guide/handler.ts:98] — implemented, deployed, and observed running each minute without errors
- [x] [Review][Patch] Increase durable checkpoint retention from one day to seven days so recovery evidence remains available throughout the one-business-day reconciliation window [amplify/functions/orientation-guide/resource.ts:9] — implemented and deployed

#### Backend tests re-review — 2026-07-23

- [x] [Review][Patch] Make the durable lifecycle fake enforce the exact consistent Session read and exact lifecycle expression values instead of hard-coding the state the production command was meant to write [amplify/functions/orientation-guide/handler.test.ts:80] — implemented and covered
- [x] [Review][Patch] Pin retained worker semantics for legacy status-less Sessions and inverted-card active patterns so AC 11 and the moved prompt/query contract cannot regress silently [amplify/functions/orientation-guide/handler.test.ts:488] — implemented and covered
- [x] [Review][Patch] Cover the accepted 10,000-character Context boundary and the conditional-create race whose consistent duplicate read returns no Session, proving fail-closed idempotency without worker invocation [amplify/functions/start-orientation-guide/handler.test.ts:76] — implemented and covered
- [x] [Review][Patch] Prove alert delivery failures propagate to retry/DLQ handling and that fixed operational email copy cannot interpolate sensitive SNS Session content [amplify/functions/orientation-alert/handler.test.ts:13] — implemented and covered
- [x] [Review][Patch] Complete reconciler coverage for exact execution-name matching, every closed durable status, both terminal updates, and propagation of unrelated Lambda/DynamoDB failures [amplify/functions/orientation-reconciler/handler.test.ts:37] — implemented and covered
- [x] [Review][Patch] Cover partial Config records, exact daily/monthly acceptance boundaries, reservation retry exhaustion, and one-attempt idempotency-marker short circuits [amplify/functions/usage-counter/reservation.test.ts:53] — implemented and covered

## Dev Notes

### Review supersession record — 2026-07-21

This append-only record supersedes stale values in the original frozen contract and task prose above:

- The worker Lambda timeout is **90 seconds**, not 60. Durable execution remains 300 seconds with one-day history retention.
- The 300-second client boundary is an **indeterminate observation timeout**, not proof that the execution is dead. Polling stops, the exact active Session ID remains stored, truthful copy warns that usage may already be reserved, and “Check this request again” resumes that exact ID.
- Worker-error notification is active through CloudWatch `AWS/Lambda Errors` → SNS → `orientation-alert` email. Tony owns acknowledgment within one hour and reconciliation within one business day under `docs/orientation-guide-reconciliation.md`.
- Normal lifecycle is `PENDING → RUNNING → SUCCEEDED | FAILED`. A parked `RUNNING` Session is the alarm-backed exception for exhausted result persistence or unconfirmed compensation; it is excluded from delivered metrics and Story 3.5 judging until reconciled.
- Canonical reservation/compensation tokens are the dashless UUID plus `RES` / `RBK` (35 characters). The old `sessionId:reserve` / `sessionId:rollback` text is invalid for DynamoDB.
- Every worker deployment must be verified through the qualified `live` alias. A probe against unqualified `$LATEST` is rejected as evidence even if it succeeds.

The final duplicate/ambiguous-start matrix is:

| Exact Session state | Starter duplicate behavior | Client ambiguous-ack behavior |
|---|---|---|
| Absent | New requests create once; an ambiguous request waits a 15-second same-ID grace before controlled failure | Never mint a replacement ID during the grace window |
| `PENDING` | Reinvoke the same qualified worker name/payload to heal create-before-invoke | Retry the starter once with the same ID and inputs, then follow that exact Session |
| `RUNNING` | Return acknowledgment; never restart | Follow the exact Session only |
| `SUCCEEDED` / legacy missing status | Return terminal acknowledgment; never restart | Render only after complete result validation |
| `FAILED` | Return terminal acknowledgment; never restart | Restore retained Context/Spread and apply its stable failure treatment |
| Compensated or otherwise stale `RUNNING` | Never restart | Follow/reconcile the exact Session; do not create paid replacement work |

Planning artifacts now use direct Tavily search with up to three valid events (zero on timeout), failed-Session Context/Spread retention, ~34–36-second durable latency evidence, and Amplify Hosting's root `/` base.

### Why this story exists (read the proposal first)

`_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-19.md` is the governing document — approved by Tony 2026-07-19. One paragraph of orientation: 3.2 put paid, ~30.7s, multi-step work behind a synchronous AppSync mutation with a hard 30s ceiling; 3.3 had to treat the resulting timeout as the normal path and infer completion by polling for a newer-than-baseline Session. It works, but a successful paid operation reports as an error at the API boundary, execution identity is inferred from row ordering, and everything downstream (3.4 redraws, 3.5 judging, 4.1 metrics) would compound the workaround. This story replaces the *boundary*, not the behavior: same reservation protocol, same providers, same prompt, same UI.

### The mental model for the durable worker

Lambda Durable Functions ≠ magic exactly-once. The runtime gives you: checkpointed steps (completed steps never re-execute on replay — their recorded results are returned), suspend/resume across invocations, and execution-name idempotency at start. It does NOT make your side effects exactly-once — **steps are at-least-once**; a step interrupted mid-flight re-runs. Hence the three layers in this story, each covering a different window:

1. **Execution-name idempotency** (start boundary): duplicate identical starts attach to the existing execution; different payload under the same name → `DurableExecutionAlreadyStartedException`.
2. **Step checkpointing** (between steps): a checkpointed Bedrock result survives crashes; persistence retries never re-call Bedrock (AC 5).
3. **Conditional writes + Session-marker items** (inside a step): the reserve/rollback transactions stay correct even if a step re-runs after DynamoDB's 10-minute idempotency-token window — the marker condition turns a replayed transaction into a recognized no-op instead of a double-count. This last layer is this story's own contribution; the runtime does not provide it.

The one unavoidable residual: a Bedrock call that succeeds but crashes before its checkpoint lands can bill twice while delivering once. The 50s in-step abort narrows the window to real crashes; accept and record it.

### What is retained verbatim (do not rewrite while moving)

- **Reservation semantics** — monthly-first precedence, all Round-1/2/3 review hardening in `reservation.ts`. You are ADDING a marker item and new tokens, not redesigning.
- **Provider logic** — Tavily query builder (399-char, every-pattern), timeout triage, ≤3-result filtering, malformed-entry tolerance; Bedrock `SYSTEM_PROMPT`, user-message JSON-evidence encoding, `end_turn` + non-blank validation, `maxTokens: 1500`, inference-profile id `us.anthropic.claude-opus-4-6-v1`.
- **Validation** — trim/10 000-char/`Object.hasOwn` guards, now in the starter.
- **The entire 3.3 UI** — Results screen, rehydration, ContextEntry visuals/copy/roles, Quick Draw, Rate-Limited Intake. The frozen review will check this survived.
- **`getOrientationStatus` flow** — untouched end to end.

### What is deliberately deleted

- The synchronous `generateOrientationGuide` mutation (schema + client util + its AppAuth tests, deleted with cause).
- `getNewestSession` and every baseline/newest-Session comparison (freeze note: prohibited from surviving).
- The worker's `getRemainingTimeInMillis` compensation-margin machinery and the persist-before-return-for-AppSync rationale (superseded; durable checkpoints replace both).
- The client's 75s recovery deadline and 5s recovery poll (replaced by lifecycle polling with the 300s deadline).

### Traps, ranked by cost if missed

1. **ClientRequestToken length** — the spine's literal `sessionId:reserve` is 43 chars; DynamoDB rejects >36 with a ValidationException at runtime, in the paid path. Use the 35-char derivation from the contract table. Record the erratum.
2. **Stale Tavily secret after deploy** — burned a day on 3.3. Probe before paid calls (Tasks 0 and 7).
3. **Re-invoking the worker without `DurableExecutionName`** — silently starts a SECOND full paid execution. The name parameter is the entire duplicate-suppression mechanism at the invoke boundary; assert it in starter tests.
4. **Unqualified worker ARN** — durable invocation rejects it outright; and `alias.grantInvoke` scopes IAM to the qualified ARN, so a bare-ARN invoke also fails auth. Env var carries the alias ARN, nothing else.
5. **Step retries on provider steps** — default retry policies would re-call Tavily/Bedrock on outright failure, violating AD-6 (and re-billing). Explicitly no-retry on those two steps; retries belong on `persist-result` only.
6. **Determinism** — `Math.random`/`Date` outside steps breaks replay (the draw would change between replays). Everything nondeterministic goes inside a step.
7. **`ampx sandbox` + `currentVersion`** — every deploy publishes a new version and moves `live`; in-flight executions keep their version (that's the point). Don't hand-pin numbered versions in code; the alias is the stable reference.
8. **Amplify `a.enum` + legacy rows** — old Sessions return `status: null`, not an error. The `?? 'SUCCEEDED'` guard plus backfill covers both directions.
9. **AppSync `a.json()` strings** — applies to the new ack payload and Session model reads alike; the house guard everywhere.

### Client flow, end to end (the contract 3.4 inherits)

```text
submit → uuid → localStorage.set(activeId) → startOrientationGuide(uuid, ctx, spread)
  ack ok            → followSession(uuid)
  throws CONFLICT   → generic error (no UI investment)
  throws other      → getSession(uuid): exists → followSession | null → clear id, generic error, next submit = fresh uuid

followSession: poll get(id) 5s, deadline 300s
  SUCCEEDED → guideResult (3.3 render path), id RETAINED (reload restores Results)
  FAILED    → clear id; DAILY → degrade | MONTHLY/other → inline copy (3.3 strings)
  deadline  → clear id, generic error

resume-on-auth: stored id? → busy + followSession(id); get → null → clear silently
clear id on: sign-out, Results ← Back, any FAILED/deadline handling
```

3.4's redraw actions will call this same submit path with a fresh UUID per deliberate submission — that's why `handleOrient` stays a single reusable entry point on App.

### Previous story intelligence

- **3.3 (frozen in review):** built everything this story re-plumbs — read its Dev Agent Record before touching `App.jsx`. Its Task 6 debug log documents the Tavily secret propagation failure AND the fix that worked. Its tests are the inventory of UX assertions that must survive the re-plumb. GPT-5 Codex implemented it red-green per task; 148 tests at close.
- **3.2 (done, partially superseded):** the supersession note at its end states exactly which contracts died and which live on — treat it as the boundary document when moving worker code. All three review rounds' hardening lives in files this story edits; regressions there are the likeliest review finding.
- **Process (retros, standing):** pre-dev prerequisites for human-only setup; environment pre-flight as Task 0; outcome-phrased live verification; never delete coverage silently (deleting the newest-Session tests requires the cause stated in the record); no always-on paid e2e; test counts established at Task 0, not hardcoded.
- **Git:** last two commits are 3.3's implementation (`4505580`) and review-mark (`687b9b3`). The correct-course planning edits are uncommitted working-tree changes — commit them WITH this story's work (they're the planning basis; preserve them, don't revert).

### Architecture compliance (the ADs that bind this story)

- **AD-19** — this story implements it end to end; re-read it before starting. AD-4 (starter/worker grant split as written), AD-5 (Tavily and Bedrock as explicit durable steps), AD-6 (tokens + replay-safety, with the erratum), AD-8 (Session lifecycle fields; marker attributes are non-schema by design), AD-9 (Session never browser-writable in any state), AD-11 (version/alias; `$LATEST` banned), AD-13 (snapshot = step checkpoint), AD-14 (timeout = success, unchanged), AD-18/AD-10 (SUCCEEDED-only metrics — 4.1's concern, but don't make it harder).
- **NFR4** — enforcement stays server-side in the reservation; the client renders lifecycle, never derives limits.
- **NFR5 (revised)** — ack ≤3s measured; generation duration decoupled from the API boundary.
- **project-context.md** — rewritten by the correct-course with a Durable Orientation Guide Execution section; it is the compressed rulebook for this story. Follow it.

### Latest tech notes (web-verified 2026-07-19)

- **Lambda Durable Functions:** [overview](https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html); [invoking](https://docs.aws.amazon.com/lambda/latest/dg/durable-invoking.html) — qualified version/alias REQUIRED, async `InvocationType: 'Event'` supports up to 1-year executions, in-flight executions stay pinned to their started version when an alias moves; [idempotency](https://docs.aws.amazon.com/lambda/latest/dg/durable-execution-idempotency.html) — `DurableExecutionName` on Invoke; identical name+payload → idempotent attach (running or closed), different payload → `DurableExecutionAlreadyStartedException`; names unique per account+region within the retention window; **steps are at-least-once — business logic must be idempotent** (their words).
- **SDK:** [`@aws/durable-execution-sdk-js`](https://github.com/aws/aws-durable-execution-sdk-js) — `withDurableExecution(handler)`, `context.step('name', async (stepCtx) => …)`, checkpointed results returned on replay; testing package `@aws/durable-execution-sdk-js-testing` with `LocalDurableTestRunner` (`setupTestEnvironment({ skipTime: true })`, `runner.run(...)`, `result.getStatus()`). [SDK reference](https://docs.aws.amazon.com/durable-execution/sdk-reference/) for step retry configuration.
- **Amplify:** `durableConfig: { executionTimeoutSeconds, retentionPeriodDays }` on `defineFunction` — present in installed `@aws-amplify/backend-function` 1.18.1 (verified in local types; Amplify's public docs lag, don't be alarmed). Checkpoint metering: per-operation checkpoint writes billed by payload size — this workflow is a handful of KB-scale checkpoints per execution, cost-negligible against the $0.03 Bedrock estimate.
- **`@aws-sdk/client-lambda` 3.1085.0 (installed):** `InvokeCommand.DurableExecutionName` confirmed in local types, plus `ListDurableExecutions`/`GetDurableExecution` for Task 7's observability evidence.
- **DynamoDB `TransactWriteItems`:** `ClientRequestToken` max 36 chars, 10-minute idempotency window — both constraints drive the token derivation + marker-item design (trap #1).

### Project Structure Notes

- New: `amplify/functions/start-orientation-guide/{resource.ts,handler.ts,handler.test.ts}`, `scripts/backfill-session-status.mjs`.
- Updated: `amplify/data/resource.ts` (Session lifecycle + op swap), `amplify/functions/orientation-guide/{resource.ts,handler.ts,handler.test.ts}` (durable rewrite), `amplify/functions/usage-counter/reservation.ts` + `reservation.test.ts` (marker items, tokens), `amplify/backend.ts` (starter, version/alias, grants), `package.json` (+3 devDeps, +1 script), `src/utils/orientation.js` + `orientation.test.js`, `src/App.jsx`, `src/components/ContextEntry.jsx`, `src/components/ContextEntry.test.jsx`, `src/AppAuth.test.jsx`, `_bmad-output/implementation-artifacts/deferred-work.md`.
- NOT touched: `OrientationGuideResults.jsx` + its test (the retained UI — zero changes is the proof of retention), `CardDisplay.jsx`, `SpreadView.jsx`, `SpreadSelector.jsx`, `OrnamentalDivider.jsx`, `PublicLanding.jsx`, `usage-counter/handler.ts` (status query unchanged), `amplify/auth/**`, other function dirs, `src/utils/deck.js`, `src/data/**`, `e2e/**`, `playwright.config.js`, `vite.config.js`.

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-19.md] — the governing correct-course: problem statement, approved direction, acceptance kernel (this story's ACs), artifact adjustments, handoff plan
- [Source: epics.md#Story-3.8] — the 12 ACs verbatim; [#Epic-3] — correct-course priority note (3.8 gates 3.4/3.5; 3.3 frozen)
- [Source: ARCHITECTURE-SPINE.md#AD-19] — the full durable-execution rule this story implements; [#AD-4/#AD-6/#AD-8/#AD-9/#AD-11/#AD-13/#AD-14] as amended 2026-07-19; [#Design-Paradigm] — starter/worker exception rationale
- [Source: _bmad-output/project-context.md#Durable-Orientation-Guide-Execution] — the compressed rule set (rewritten 2026-07-19)
- [Source: _bmad-output/implementation-artifacts/3-2-…md#Post-completion-Architecture-Correction] — retained vs. superseded inventory for the worker move; [#Contract-values] — provider values that carry over verbatim
- [Source: _bmad-output/implementation-artifacts/3-3-…md#Architecture-Correction-and-Review-Freeze] — the six prohibited temporary contracts; [#Debug-Log-References] — the Tavily secret propagation incident + fix; [#Tasks] — the UX assertions inventory that must survive re-plumbing
- [Source: EXPERIENCE.md#State-Patterns] (updated 2026-07-19) — in-flight/failed/ambiguous-ack/active-Session-reload rows; [#Accessibility-Floor] — no repeated announcements of unchanged polled state
- [Source: amplify/backend.ts, amplify/functions/orientation-guide/*, amplify/functions/usage-counter/reservation.ts, src/App.jsx, src/components/ContextEntry.jsx, src/utils/orientation.js] — the exact code being restructured (all read during story creation)
- Web-verified 2026-07-19: [durable functions](https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html), [invoking](https://docs.aws.amazon.com/lambda/latest/dg/durable-invoking.html), [idempotency](https://docs.aws.amazon.com/lambda/latest/dg/durable-execution-idempotency.html), [SDK repo](https://github.com/aws/aws-durable-execution-sdk-js), [SDK reference](https://docs.aws.amazon.com/durable-execution/sdk-reference/)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Follow Tasks 0–8 in story order with red-green-refactor, preserving the approved correct-course planning edits and retained Story 3.3 UI.
- Prove durable-function support and provider health before changing dependent contracts, then implement schema/starter, replay-safe worker, backend wiring, migration, and exact-Session frontend tracking.
- Deploy, backfill, live-verify lifecycle/idempotency/reload/counter outcomes, restore the captured sandbox baseline, and complete every repository/browser/security/commit gate.

### Debug Log References

- 2026-07-19 UTC — Task 0 local baseline: 148/148 unit and integration tests, lint, typecheck, production build, anonymous Playwright 2/2, and credentialed Playwright 4/4 passed.
- 2026-07-19 UTC — Task 0 sandbox baseline: Config `dailyLimit=5`, `monthlyBudget=30`; dedicated test-account DailyUsage `count=5`; MonthlySpend `spent=0.15`; Session row count `5`. Credentials and account identifiers were not copied into repository artifacts.
- 2026-07-19 UTC — Task 0 durable-capability probe: adding the story-frozen `durableConfig` deployed cleanly to us-east-1 in 116.901 seconds; CloudFormation replaced the worker Lambda and published its `currentVersion`, proving account/region/toolchain support.
- 2026-07-19 UTC — Task 0 HALT: the newly deployed worker's in-memory `TAVILY_API_KEY` returned HTTP 401. No paid generation was attempted. Per the story prerequisite and Task 0 gate, the stored current secret must be propagated directly to the replacement sandbox worker Lambda environment, then the in-memory HTTP check must return 200 before implementation resumes.
- 2026-07-19 UTC — Task 0 resume remained HALTed: the in-memory check still returned HTTP 401. The active physical worker is `amplify-tarotspa-tonyreyn-orientationguidelambda69-KzmpiW10SELD`; its configuration remains last modified at `2026-07-19T17:00:20.533Z`, the durable-probe deployment time, so the attempted repair did not update this Lambda resource.
- 2026-07-19 UTC — Task 0 resumed successfully after Tony propagated the current secret to the replacement worker: the in-memory Tavily probe returned HTTP 200 with one result, and the final 148/148 regression remained green.
- 2026-07-19 UTC — Task 1 red-green-refactor: the required dependency check first failed with all three packages absent and the schema still exposed the synchronous mutation. Added the frozen lifecycle/API contract and packages; typecheck and the 148/148 regression passed.
- 2026-07-19 UTC — Task 2 red-green-refactor: 11 starter tests first failed because the handler was absent. Implemented authenticated validation, conditional Session creation, conflict classification, byte-identical named async invocation, and the duplicate-start healing path; targeted tests, typecheck, lint, and the 159/159 regression passed.
- 2026-07-19 UTC — Task 3 red-green-refactor: 13 durable worker tests first failed against the synchronous handler. Rewrote it as named checkpointed steps and exercised the lifecycle with AWS's `LocalDurableTestRunner`; added replay-safe three-item reservation/compensation transactions and 35-character tokens. Focused 23/23, typecheck, lint, and full 150/150 passed.
- 2026-07-19 UTC — Task 4 backend wiring: registered the starter, widened the worker's Session grant to read/write, published the worker's current version behind the stable `live` alias, and scoped starter invocation to that qualified alias. Typecheck, lint, and 150/150 tests passed.
- 2026-07-19 UTC — Task 5 migration implementation: mirrored the existing environment-scoped SSM CLI, added paginated conditional legacy-Session backfill plus a package script, and recorded staging/main and alias rollout work. Syntax check, typecheck, lint, and 150/150 tests passed; live idempotency/content validation remains in Task 7.
- 2026-07-19 UTC — Task 6 red-green-refactor: exact-lifecycle App tests failed against the prohibited newest-Session import, then passed after App-owned request identity, active-ID persistence/resume, cancel-safe exact polling, terminal mapping, and ambiguous-ack handling replaced the old 75-second recovery loop. Focused 39/39 and full 154/154 passed with lint, typecheck, build, and a zero-hit prohibited-contract sweep.
- 2026-07-20 UTC — Task 7 deployment/backfill: the full stack deployed in 223.302 seconds with starter, durable worker version, `live` alias, schema, and Session-table SSM discovery. Backfill updated 5 legacy rows, the second run updated 0, all 5 became `SUCCEEDED`, and a content-safe spot check retained the exact 5,465-character Guide length with `completedAt = updatedAt`.
- 2026-07-20 UTC — Task 7 headline/reload: Tavily returned HTTP 200 before spend. The authenticated UI acknowledged in 1,239 ms and rendered the exact Session's `SUCCEEDED` Results in 35,663 ms; reload during `RUNNING` kept the same ID, reload after Results restored it, and Back cleared it. The final post-fix healthy run acknowledged in 552 ms and completed in 34,094 ms.
- 2026-07-20 UTC — Task 7 duplicate-start: two simultaneous identical starts returned the same ID, produced one Session and one pinned durable execution, and moved DailyUsage/MonthlySpend once; changed input under that ID returned `IDEMPOTENCY_CONFLICT`. AWS's list API rejected alias filtering in this region, so observability listed pinned numeric version 2 then filtered client-side by the exact durable name.
- 2026-07-20 UTC — Task 7 live defect/fix: the first daily-limit execution exposed the durable SDK's six-attempt default retry and Lambda's stripped `StepError`, leaving a no-reservation Session `RUNNING`. Added RED assertions for one reserve attempt and in-step business-code checkpointing, configured reserve `noRetry`, returned a discriminated reserve outcome before the wrapper boundary, passed 155/155, deployed worker version 3 in 157.55 seconds, and conditionally reconciled the diagnostic row after its failed execution.
- 2026-07-20 UTC — Task 7 limit/reconciliation: version 3 delivered terminal Daily and Monthly failures with the frozen codes, correct Quick Draw/inline treatment, preserved Context, cleared active IDs, and no spend. Final Config is restored to 5/30; UTC crossed during the story, so July 19 remains count 5 and July 20 correctly records 3 paid successes; MonthlySpend is 0.24 = captured 0.15 + 3 × 0.03. All 11 Sessions are terminal.
- 2026-07-20 UTC — Task 7 observability/browser: final version-3 execution was uniquely visible as `SUCCEEDED`; CloudWatch had zero hits for the distinctive synthetic Context phrase. The in-app browser surface rejected its own sandbox metadata, so one-off Playwright scratch scripts performed the real UI work and were deleted afterward. Anonymous 2/2 and credentialed 4/4 suites passed untouched. Compensation/persistence failures stayed LocalDurableTestRunner-only by design.
- 2026-07-20 UTC — Task 8 final gate: 155/155 tests, lint, typecheck, production build, anonymous Playwright 2/2, and credentialed Playwright 4/4 passed on the final source state. The credential/content sweep was clean, the retained Results/e2e/config surfaces remained unchanged, and `playwright/.auth/user.json` remained ignored and untracked.
- 2026-07-20 UTC — Review patch pass: resolved all three review decisions and applied nine patches covering same-ID starter healing, status-aware duplicate invocation, strongly consistent duplicate reads, checkpoint-stable accounting metadata, original-period compensation, replay marker precedence, infrastructure-failure terminalization, a 90-second worker timeout, and a no-action worker-error alarm. Full verification passed with 163/163 tests, lint, typecheck, production build, anonymous Playwright 2/2, and credentialed Playwright 4/4.
- 2026-07-20 UTC — Review deployment: two attempted log-filter alarm designs exposed and cleanly rolled back an Amplify-generated Lambda version/AppSync dependency cycle. The cycle-free native `AWS/Lambda Errors` alarm deployed successfully with no actions; worker `live` now targets immutable version 4, the function timeout is 90 seconds, and the alarm is `OK`.
- 2026-07-20 UTC — Review verification HALT: after SSO refresh, the newly deployed worker's credential-safe Tavily probe returned HTTP 401. No paid generation was attempted. Per the story's prerequisite, Tony must propagate the stored current secret directly to `amplify-tarotspa-tonyreyn-orientationguidelambda69-KzmpiW10SELD`, then the probe must return HTTP 200 before review closeout resumes.
- 2026-07-20 UTC — Review verification resumed after Tony propagated the current secret: the credential-safe deployed-worker Tavily probe returned HTTP 200 with one result. No secret value was printed and no paid Bedrock generation was run. Backend/runtime review chunk 1 is complete; the story remains in progress pending the planned backend-test, frontend, and documentation review chunks.
- 2026-07-20 UTC — Review alias correction: the first post-repair HTTP 200 proved only `$LATEST`; alias-qualified version 4 remained stale and returned HTTP 401. Published the corrected `$LATEST` as immutable version 5, moved `live` to version 5, and reran the alias-qualified probe: HTTP 200 with one result. No paid Bedrock generation was run. Future deploy verification must always probe `--qualifier live`.
- 2026-07-21 UTC — Full review patching resumed after chunk triage. The frontend now treats the 300-second boundary as indeterminate and recoverable, validates exact complete result contracts, preserves safe Context/Spread, bounds missing-row recovery, prevents same-tick duplicate submission, and tolerates denied storage. Backend suites now pin complete transactions/results and real Tavily/Bedrock abort boundaries. Alarm email wiring and the Tony-owned reconciliation runbook were added. Deployment and synthetic compensated-failure evidence remain outstanding until local/browser gates pass.
- 2026-07-23 UTC — Final review gates passed on the patched source: focused suites passed, full Vitest passed 211/211, lint/typecheck/build passed, anonymous Playwright passed 2/2, and credentialed Playwright passed 4/4. `git diff --check` and the credential/content sweep were clean. The Vite build retained its pre-existing >500 kB chunk advisory without failing.
- 2026-07-23 UTC — Review notification deployment completed to the `tonyreynolds` sandbox in 102.548 seconds. The worker alarm was `OK` with one SNS action, the content-free alarm test invoked `orientation-alert` with no error-filter log events, and the alarm was returned to `OK`. The unchanged worker `live` alias remained on immutable version 5; its alias-qualified Tavily probe returned HTTP 200 with one result.
- 2026-07-23 UTC — AC 12 compensated-failure verification used one content-safe synthetic exact Session with an invalid Spread so execution stopped at Draw before Tavily/Bedrock. Metadata-only durable history proved `reserve → draw failed → compensate → mark-failed`, with no provider steps. The exact Session reached `FAILED/GENERATION_FAILED`, both reservation markers existed, the handled durable execution reached `SUCCEEDED`, and DailyUsage/MonthlySpend deltas were both zero. The synthetic Session row and temporary verifier were removed afterward.
- 2026-07-23 UTC — Sandbox verification is complete. Staging and `main` promotion/backfill remain separate release operations and were not performed by this review; each environment must deploy, backfill twice, probe the qualified `live` alias, and pass its own content-safe lifecycle/reconciliation checks before promotion.
- 2026-07-23 UTC — Runtime/infrastructure re-review applied eight patches: durable failure/timeout alarms, worker and alert-path DLQs with monitoring, exact Session-table IAM, operation-scoped WAF admission throttling, strict Tavily event validation, an automated stale-`PENDING` reconciler, and seven-day durable history. The first deployment exposed a generated-stack dependency cycle and rolled back cleanly; operational resources were moved to the parent data stack and the second deployment completed successfully. Live evidence confirmed six `OK` alarms, worker DLQ plus seven-day retention, and three consecutive error-free one-minute reconciler executions. Local verification passed 215/215 tests under Node 24, typecheck, lint, build, and `git diff --check`.

### Completion Notes List

- Task 0 complete: all local/browser/AWS baselines passed; sandbox state was captured; the durable configuration deployed successfully; and the replacement worker's repaired Tavily credential passed in memory before any paid generation.
- Task 1 complete: added the durable SDK/testing/Lambda client development dependencies, Session lifecycle fields, and authenticated `startOrientationGuide` mutation while preserving owner-read-only Session authorization and the untouched usage-status query.
- Task 2 complete: added the fast, secret-free starter Lambda with strict UUID/input validation, owner-bound conditional `PENDING` creation, exact-input idempotency, qualified durable invocation, conflict rejection, and comprehensive DI coverage.
- Task 3 complete: converted the provider workflow to a version-ready durable handler with explicit no-retry provider steps, checkpointed Bedrock output, persistence-only retries, ordered fail-closed compensation, Session lifecycle transitions, replay guards, and LocalDurableTestRunner coverage.
- Task 4 complete: wired the starter and durable worker in the data stack with least-privilege table access, a stable version-pinned `live` alias, qualified invoke permissions, and alias/table environment values.
- Task 5 complete locally: added the paginated, conditional, rerunnable legacy Session migration and environment-scoped table discovery; live two-run/content-preservation evidence follows after deployment in Task 7.
- Task 6 complete: replaced synchronous/newest-row recovery with client UUIDs, exact Session polling, 300-second lifecycle handling, ambiguous-ack recovery without resubmission, reload resume, controlled retained UI states, and storage cleanup on every specified exit.
- Task 7 complete: deployed/backfilled idempotently, measured ≤3-second acknowledgments and ~34–36-second durable completions, proved reload/exact-ID/duplicate/conflict/limit/counter/observability contracts live, fixed the production durable reserve-boundary defect found by the limit test, restored configuration, and removed all paid-test scratch code.
- NFR5 evidence: headline acknowledgment 1,239 ms and end-to-end 35,663 ms; final post-fix acknowledgment 552 ms and end-to-end 34,094 ms.
- Architecture erratum for Tony: spine AD-6's literal `sessionId:reserve` / `sessionId:rollback` tokens exceed DynamoDB's 36-character maximum; implementation uses the approved deterministic 35-character no-dashes UUID plus `RES` / `RBK` suffix.
- Review supersession: the original 60-second worker, cleared-ID 300-second deadline, no-new-copy, and unconditional-terminal prose are historical. The verified contract is 90 seconds, retained exact-ID indeterminate recovery copy, and an alarm-backed parked-`RUNNING` operational exception.
- Final review verification: 211/211 Vitest, lint, typecheck, build, anonymous Playwright 2/2, credentialed Playwright 4/4, deployed SNS/email alert path, alias-qualified Tavily HTTP 200, and a no-provider synthetic reserve/compensate lifecycle all passed. All 25 patch findings are resolved; two pre-existing items remain explicitly deferred.
- Worker-test path: AWS `LocalDurableTestRunner` was used successfully for the named durable lifecycle, retries, compensation ordering, replay guard, timeout, and limit coverage; directly exported step bodies cover provider/prompt/triage boundaries.
- Task 8 complete: every local and browser gate passed on the final source state, deployment-only follow-up is recorded, the credential/content sweep is clean, and Story 3.8 is ready for the integrated review with Story 3.3's retained UI.

### File List

- `_bmad-output/implementation-artifacts/3-8-make-orientation-guide-generation-durable-and-asynchronous.md`
- `_bmad-output/implementation-artifacts/3-2-generate-an-orientation-guide-bounded-by-the-daily-and-monthly-limits.md`
- `_bmad-output/implementation-artifacts/3-3-view-the-orientation-guide-results-screen.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-19.md`
- `_bmad-output/planning-artifacts/architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/addendum.md`
- `_bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/prd.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-tarot-spa-2026-07-09/EXPERIENCE.md`
- `_bmad-output/project-context.md`
- `docs/orientation-guide-reconciliation.md`
- `amplify/data/resource.ts`
- `amplify/backend.ts`
- `amplify/functions/orientation-alert/handler.test.ts`
- `amplify/functions/orientation-alert/handler.ts`
- `amplify/functions/orientation-alert/resource.ts`
- `amplify/functions/orientation-guide/handler.test.ts`
- `amplify/functions/orientation-guide/handler.ts`
- `amplify/functions/orientation-guide/resource.ts`
- `amplify/functions/orientation-reconciler/handler.test.ts`
- `amplify/functions/orientation-reconciler/handler.ts`
- `amplify/functions/orientation-reconciler/resource.ts`
- `amplify/functions/start-orientation-guide/handler.test.ts`
- `amplify/functions/start-orientation-guide/handler.ts`
- `amplify/functions/start-orientation-guide/resource.ts`
- `amplify/functions/usage-counter/reservation.test.ts`
- `amplify/functions/usage-counter/reservation.ts`
- `package-lock.json`
- `package.json`
- `scripts/backfill-session-status.mjs`
- `src/App.jsx`
- `src/AppAuth.test.jsx`
- `src/components/ContextEntry.jsx`
- `src/components/ContextEntry.test.jsx`
- `src/utils/orientation.js`
- `src/utils/orientation.test.js`

## Change Log

- 2026-07-19: Story created via create-story workflow from the approved sprint change proposal — status ready-for-dev.
- 2026-07-20: Implemented, deployed, backfilled, live-verified, and passed all final gates — status review; next step is the integrated review of Story 3.8 with Story 3.3's retained UI.
- 2026-07-20: Code-review patches implemented and deployed; status returned to in-progress pending the required Tavily secret propagation and HTTP 200 verification.
- 2026-07-20: Backend/runtime review chunk 1 completed after the repaired configuration was published as worker version 5 and the alias-qualified Tavily probe passed; remaining review chunks keep the story in progress.
- 2026-07-23: Integrated code review completed; all 25 patch findings were implemented and verified locally, in browser, and proportionally in the sandbox. Story status moved to done; staging/main rollout remains a release operation.
- 2026-07-23: Runtime/infrastructure re-review resolved both decisions and applied, tested, deployed, and live-audited all eight resulting patches; Story 3.8 remains done.
