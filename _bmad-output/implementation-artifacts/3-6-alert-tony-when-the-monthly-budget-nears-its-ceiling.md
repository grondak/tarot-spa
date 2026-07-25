---
baseline_commit: 49682b3
---

# Story 3.6: Alert Tony when the monthly budget nears its ceiling

Status: ready-for-dev

## Story

As Tony,
I want to be proactively notified when spend approaches the monthly ceiling,
So that I don't have to remember to check the dashboard to catch a runaway cost.

*(Infrastructure-only story — zero `src/` changes, zero Amplify Data schema changes. This is FR10's alerting half; the blocking half (the in-app MonthlySpend reservation ceiling) already shipped in Story 3.2/3.8 — AD-6 explicitly frames this story's mechanism as "AWS Budgets + SNS remains the secondary safety net that catches estimate-vs-actual drift over time (not the primary blocking mechanism)." A manual AWS Budgets tripwire has covered this gap since before Story 3.2 (sprint-status action item, Tony, done); this story replaces that manual console setup with the equivalent infrastructure-as-code so it survives environment rebuilds and matches every other alerting path in this codebase.)*

## Acceptance Criteria

1. **Given** aggregate spend crosses the configured warning threshold (80%) of the monthly budget, **when** the threshold is crossed, **then** Tony receives a push notification by email (AWS Budgets → SNS → Lambda → SES) — not something he has to notice on the dashboard (NFR3)
2. **Given** aggregate spend is well under the warning threshold, **when** nothing unusual happens, **then** no alert fires — this is a genuine threshold alert, not noisy per-request notification (satisfied by construction: AWS Budgets only publishes when its comparison operator evaluates true, so no application-level suppression logic is needed)

**Scope note on channel:** the epic text says "email/SMS via AWS Budgets + SNS." This story implements **email only** — SMS needs a phone-number secret that doesn't exist anywhere in this codebase yet, and no story has asked for one. Adding it is a small, isolated follow-up (one more `SmsSubscription` on the same topic) if Tony wants it later. Flagged for Tony at the end of this story record; do not build SMS speculatively.

## Copy

**No user-facing copy** (this alert reaches only Tony's own cutout inbox, not end users). One authored, fixed, non-interpolating email:

- **Subject:** `tarot-spa monthly budget alert`
- **Body:** `The AWS Budgets tripwire for tarot-spa's aggregate monthly spend crossed its configured warning threshold. Check the AWS Budgets console for current spend-to-date against the ceiling. This is the secondary AWS-level safety net (AD-6) — the primary control is the in-app MonthlySpend reservation, which independently blocks new Orientation Guide requests once the app-tracked ceiling is reached.`

Do not interpolate the real SNS message content into this email (see Contract values table, Handler shape row) — this is fixed copy, matching `orientation-alert`'s convention exactly.

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. **Valid AWS session at story start and through live verification.** This story deploys the sandbox and creates one real (free) `AWS::Budgets::Budget` resource — Budgets itself has no cost; only crossing the real threshold triggers a notification, and this story does not need real spend to verify delivery (see Task 3).
2. Confirm `ACCESS_FROM_EMAIL` and `CUTOUT_EMAIL` are still listed in `npx ampx sandbox secret list` and the SES identity is still verified — this story reuses both, exactly as configured for Stories 2.2/3.5. No new secret, no new SES verification.
3. No other setup. Unlike 3.2/3.5, there is no new model access, no new third-party API, and no new IAM cycle risk class beyond a pattern this codebase already has three working examples of.

## Contract values (frozen — the dev agent implements exactly these)

| Item | Value |
|---|---|
| New Lambda | `amplify/functions/budget-alert/` (`resource.ts`, `handler.ts`, `handler.test.ts`) — a sibling of `orientation-alert`, not a shared module (same reasoning 3.5 used for `orientation-judge` vs. the worker: different concern, copying the small pattern is cheaper than abstracting it). `defineFunction({ name: 'budget-alert', resourceGroupName: 'data', timeoutSeconds: 10, environment: { ACCESS_FROM_EMAIL: secret('ACCESS_FROM_EMAIL'), CUTOUT_EMAIL: secret('CUTOUT_EMAIL') } })` — byte-identical secret wiring to `orientation-alert/resource.ts`, same two secrets, no new ones |
| Handler shape | Copy `orientation-alert/handler.ts`'s exact DI shape (`Dependencies = { ses, fromEmail, cutoutEmail }`, `createHandler(deps)`, default deps from `SESv2Client`/env), the same `EventSource !== 'aws:sns'` / empty-Records guard, and the same "missing config throws" guard. Only the fixed Subject/Body text differs (see Copy section above). Do **not** parse or relay `event.Records[].Sns.Message` — mirror the established fixed-copy, non-interpolating convention from `orientation-alert` for consistency across both alert Lambdas, even though a Budgets notification body carries no Session-derived content (there's nothing sensitive to protect here, but symmetry keeps this codebase's alert-email policy simple to reason about) |
| Budget dollar ceiling | `MONTHLY_BUDGET_CEILING_USD = 30` — a plain CDK-level constant in `backend.ts`, deliberately mirroring (not reading) Config's `monthlyBudget` seed default (`scripts/seed-config.mjs`, NFR6). CloudFormation synth cannot read a live DynamoDB value, so this is a second, independently-maintained number. **If Story 4.3 changes Config's `monthlyBudget` later, this constant does not follow it automatically** — record that as a known, accepted gap (Dev Notes), not something to solve with a custom resource in this story |
| Warning threshold | `MONTHLY_BUDGET_WARNING_THRESHOLD_PERCENT = 80`, matching the epic's explicit example and PRD FR10/NFR3 |
| Local const declarations | Add alongside the existing `const xLambda = backend.x.resources.lambda;` block near the top of `backend.ts` (do not skip this — every row below reads `budgetAlertLambda` as an already-declared local, and Task 2 has its own explicit bullet for it): `const budgetAlertLambda = backend.budgetAlert.resources.lambda;` |
| Budget name (computed early — needed by two different resources) | `const monthlyBudgetName = \`${backendNamespace}-${backendName}-monthly-budget\`;` — compute this from the `backendNamespace`/`backendName` CDK context **before** the SNS topic's resource policy (below), not only later at the `CfnBudget` site. It's a plain string derived from CDK context, not from either resource construct, so there's no ordering/circular-dependency problem computing it early and reusing it in both places. If the existing `backendNamespace`/`backendName` context read (currently further down the file, for the SSM prefix) needs hoisting earlier to make this possible, hoist it — same context, same idempotent `tryGetContext` calls, just read sooner |
| New SNS Topic | Construct id **`MonthlyBudgetAlertTopic`**, in `operationalStack`: `const budgetAlertTopic = new Topic(operationalStack, 'MonthlyBudgetAlertTopic');` (no explicit `topicName` needed — unlike the Budget, topics don't collide across environments the way account-scoped Budget names do) |
| Topic → Budgets publish permission (hardened — do not use a bare `grantPublish`, and scope tighter than the reference implementation) | Verified against a working reference CDK implementation (web-checked 2026-07-25, [dzone.com/articles/aws-budget-notifications-sns-cdk](https://dzone.com/articles/aws-budget-notifications-sns-cdk)): use an explicit `addToResourcePolicy` with confused-deputy conditions, not `topic.grantPublish(new ServicePrincipal(...))` — a bare service-principal grant doesn't scope to *this* account, so any AWS account's Budgets service could theoretically target the topic. The reference implementation scopes `aws:SourceArn` to a wildcard (`arn:aws:budgets::<account>:*` — any budget in the account); this story can do strictly better because `monthlyBudgetName` (above) is already known at this point — scope to the exact budget ARN instead. Add `ServicePrincipal` to the existing `aws-cdk-lib/aws-iam` import, then: `budgetAlertTopic.addToResourcePolicy(new PolicyStatement({ actions: ['sns:Publish'], principals: [new ServicePrincipal('budgets.amazonaws.com')], resources: [budgetAlertTopic.topicArn], conditions: { ArnEquals: { 'aws:SourceArn': \`arn:aws:budgets::${operationalStack.account}:budget/${monthlyBudgetName}\` }, StringEquals: { 'aws:SourceAccount': operationalStack.account } } }))` — `PolicyStatement`'s default `effect` is `ALLOW`, no need to import `Effect` |
| Topic → Lambda wiring | Exact same shape as the existing `workerFailureTopic.addSubscription(new LambdaSubscription(orientationAlertLambda, { deadLetterQueue: alertDeliveryDeadLetterQueue }))` block, construct id **`MonthlyBudgetAlertDeliveryDeadLetterQueue`** for the new queue: `const budgetAlertDeliveryDeadLetterQueue = new Queue(operationalStack, 'MonthlyBudgetAlertDeliveryDeadLetterQueue', { encryption: QueueEncryption.SQS_MANAGED, retentionPeriod: Duration.days(14) });` then the same `CfnFunction.deadLetterConfig` + `grantSendMessages` + `budgetAlertTopic.addSubscription(new LambdaSubscription(budgetAlertLambda, { deadLetterQueue: budgetAlertDeliveryDeadLetterQueue }))` pattern as the existing block |
| Observability on the alert path itself | One more Errors alarm, construct id **`MonthlyBudgetAlertLambdaErrorAlarm`**, exact shape of the existing `alertLambdaErrorAlarm` (`orientationAlertLambda.metricErrors()`, 5 min, threshold 1, `NOT_BREACHING`), but on `budgetAlertLambda.metricErrors()`, action → the **existing** `workerFailureTopic` (reuse it — a broken alert Lambda is a general "something in the alerting pipeline broke" signal, not orientation-specific, and reusing the existing topic avoids a bootstrapping problem: a new alert Lambda that fails silently would otherwise have no one watching it) |
| SES policy for the new Lambda | Same wildcard pattern as `orientationAlertLambda`/`requestAccessLambda`'s existing blocks: `budgetAlertLambda.addToRolePolicy(new PolicyStatement({ actions: ['ses:SendEmail'], resources: [dataStack.formatArn({ service: 'ses', resource: 'identity', resourceName: '*' })] }))` |
| `defineBackend` wiring | Add `budgetAlert` to the imports + the `defineBackend({...})` object, alongside the other functions (alphabetical-ish, matching existing order) |
| `CfnBudget` (from `aws-cdk-lib/aws-budgets`) | Construct id **`MonthlyBudget`**, placed in `operationalStack` (the same stack already hosting `workerFailureTopic`/alarms), created **after** `budgetAlertTopic` exists (it references `budgetAlertTopic.topicArn`) but reuses the **same** `monthlyBudgetName` computed earlier for the resource-policy condition — do not recompute or duplicate the template literal. Shape (verified against the installed `aws-cdk-lib` type defs at `node_modules/aws-cdk-lib/aws-budgets/lib/budgets.generated.d.ts`): `new CfnBudget(operationalStack, 'MonthlyBudget', { budget: { budgetName: monthlyBudgetName, budgetType: 'COST', timeUnit: 'MONTHLY', budgetLimit: { amount: MONTHLY_BUDGET_CEILING_USD, unit: 'USD' } }, notificationsWithSubscribers: [{ notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: MONTHLY_BUDGET_WARNING_THRESHOLD_PERCENT, thresholdType: 'PERCENTAGE' }, subscribers: [{ subscriptionType: 'SNS', address: budgetAlertTopic.topicArn }] }] })` |

## Explicitly out of scope (do not build)

- **No SMS.** See the Scope note above.
- **No change to the in-app MonthlySpend reservation gate, Config schema, or `usage-counter`/`orientation-guide` code.** That enforcement already exists (Story 3.2/3.8) and is untouched by this story.
- **No attempt to sync the CDK-level `MONTHLY_BUDGET_CEILING_USD` constant with the live Config DynamoDB item.** Two independently-maintained ceilings is the accepted design (see Contract values row above and Dev Notes scope decision 2).
- **No per-environment branch-guarding logic** (e.g. gating budget creation to only the `main` branch). This codebase has no `staging`/`main` Amplify Hosting branches deployed yet — everything so far is a single `npx ampx sandbox` environment (see Dev Notes scope decision 3 for the reasoning and the accepted future tradeoff once branches exist).
- **No CDK/`backend.ts` unit test.** None of the seven existing alarms/topics/queues/WAF rules in `backend.ts` have one; this story's infra additions follow that same precedent and are verified live instead (Task 3).

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight** (AC: none — gate)
  - [x] Confirm `git log -1` is `49682b3` and the tree is clean before any change. If pre-existing uncommitted work exists, follow the 3.4/3.5 precedent — isolate and commit it separately, never discard it.
  - [x] Gates green at baseline: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Use the project's Node 24 toolchain.
  - [x] AWS credentials valid; `npx ampx sandbox secret list` shows `ACCESS_FROM_EMAIL` and `CUTOUT_EMAIL` still present (pre-dev prerequisite 2) — if either is missing, HALT for Tony.
- [x] **Task 1: `budget-alert` Lambda** (AC: 1)
  - [x] `amplify/functions/budget-alert/resource.ts` per the contract table.
  - [x] `amplify/functions/budget-alert/handler.ts` — copy `orientation-alert/handler.ts`'s structure (DI shape, guards, `SendEmailCommand` call) with only the Subject/Body text changed per the contract table. Do not add message parsing/relay (see contract row).
  - [x] `amplify/functions/budget-alert/handler.test.ts` — mirror `orientation-alert/handler.test.ts`'s three cases: (a) valid SNS event → SES called once with the exact fixed Subject/Body from the Copy section; (b) SES rejection propagates (throws, for Lambda's built-in async retry + DLQ to catch); (c) missing config (`cutoutEmail` empty) throws before sending, and a non-`aws:sns` `EventSource` throws before sending.
- [x] **Task 2: `amplify/backend.ts` wiring** (AC: 1, 2)
  - [x] Add `budgetAlert` to imports and `defineBackend({...})`.
  - [x] Declare `const budgetAlertLambda = backend.budgetAlert.resources.lambda;` alongside the existing per-function `const xLambda = ...` declarations — every bullet below depends on this existing first.
  - [x] Add `ServicePrincipal` to the existing `aws-cdk-lib/aws-iam` import; add `import { CfnBudget } from 'aws-cdk-lib/aws-budgets';`.
  - [x] Compute `monthlyBudgetName` (contract table) from the `backendNamespace`/`backendName` CDK context — hoist that context read earlier in the file if it isn't already available at this point (it's currently read further down for the SSM prefix; `tryGetContext` is idempotent, so reading it twice or moving the read is both fine — just don't duplicate the "missing context → throw" guard's error message inconsistently). This must happen **before** the resource-policy bullet below, since the policy's `aws:SourceArn` condition needs it.
  - [x] Build the DLQ + `deadLetterConfig` + `grantSendMessages` block for `budgetAlertLambda`, exactly mirroring the existing `alertDeliveryDeadLetterQueue` block's shape (new names: `budgetAlertDeliveryDeadLetterQueue`, etc).
  - [x] Create `budgetAlertTopic` (`Topic`, `operationalStack`), subscribe `budgetAlertLambda` via `LambdaSubscription` with the new DLQ, per the contract table.
  - [x] Grant `budgets.amazonaws.com` publish on `budgetAlertTopic` per the contract table's hardened, exact-ARN-scoped policy (uses `monthlyBudgetName` from above — do not use the reference implementation's wildcard `:*` form).
  - [x] Add the `budgetAlertLambda` Errors alarm feeding `workerFailureTopic`, exactly mirroring `alertLambdaErrorAlarm`'s shape.
  - [x] Add the SES `sendEmail` policy statement for `budgetAlertLambda`, exactly mirroring the existing `orientationAlertLambda`/`requestAccessLambda` blocks.
  - [x] Define `MONTHLY_BUDGET_CEILING_USD` / `MONTHLY_BUDGET_WARNING_THRESHOLD_PERCENT` constants near the top of the file with the one-line comment from the contract table explaining the Config-drift accepted gap.
  - [x] Create the `CfnBudget` per the contract table, reusing the **same** `monthlyBudgetName` computed above (not a fresh template literal) — created after `budgetAlertTopic` since it references `budgetAlertTopic.topicArn`.
- [x] **Task 3: Deploy + live verification** (AC: 1, 2)
  - [x] `npx ampx sandbox --once`. A clean deploy is expected — two independent working CDK reference implementations (web-checked, Dev Notes) deploy `CfnBudget` + SNS with no region pinning, so this is not expected to be a blocker. If it does fail on a region-related CloudFormation error, HALT and report to Tony rather than guessing at a workaround.
  - [x] **Structural verification (AC 1, 2 — the wiring, not real billing):** `aws budgets describe-budgets --account-id <account-id>` shows the new budget with `BudgetLimit.Amount = "30.0"`, `BudgetType = COST`, `TimeUnit = MONTHLY`; `aws budgets describe-notifications-for-budget` shows one `ACTUAL`/`GREATER_THAN`/80%/`PERCENTAGE` notification; `aws budgets describe-subscribers-for-notification` shows one `SNS` subscriber pointing at the new topic ARN.
  - [x] **Delivery verification (AC 1 — the actually-testable part without waiting on real billing data, which AD-6 already documents as lagging):** `aws sns publish --topic-arn <budgetAlertTopic ARN> --message "story-3.6 manual verification"` and confirm the fixed-copy email arrives at the `CUTOUT_EMAIL` inbox within a couple minutes, with exactly the Subject/Body from the Copy section (not the raw test message — proving the Lambda ignores message content as designed). This is the accepted verification boundary: real threshold-crossing is not simulated (would require real spend or waiting on AWS's billing-data lag), only the delivery path is exercised end-to-end.
  - [x] **No-alert-fires sanity (AC 2):** confirm no email arrived from an untouched deploy before the manual publish above — i.e. don't publish the test message until after confirming this.
  - [x] Do not attempt to force a real budget breach. No new spend is required or appropriate for this story.
- [ ] **Task 4: Close out (Definition of Done)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. (No `npm run test:e2e` impact expected — zero `src/` changes — but run it anyway per the standing closeout gate.)
  - [x] Sweep the diff and this story file for credentials/secrets; no dollar figures beyond the already-public `$30`/`80%` design constants; no AWS account ID committed anywhere in code (the live-verification AWS CLI commands used it locally only).
  - [x] `deferred-work.md`: record (a) the accepted Config-vs-CDK-constant budget-ceiling drift (Contract values table), flagged for revisit if/when Story 4.3 ships and Tony wants them kept in sync; (b) the accepted per-environment Budget duplication risk once `staging`/`main` branches are eventually stood up as persistent parallel environments (Dev Notes scope decision 3) — each would mint its own `AWS::Budgets::Budget` watching the same real account-level spend, producing duplicate (not incorrect) notifications; revisit only if that actually starts happening.
  - [ ] Update `sprint-status.yaml` (3-6 → review), commit with an isolated diff, push to `main`.

## Dev Notes

### Scope decisions (made at story creation — implement as written, flag disagreement rather than silently deviating)

1. **Email only, no SMS.** See the Acceptance Criteria scope note. No phone-number secret exists anywhere in this codebase; inventing one for a single story not otherwise scoped for it would be premature infrastructure. Flagged to Tony at the end of this story record.
2. **Two independently-maintained budget ceilings, not one synced value.** The in-app MonthlySpend reservation (AD-6, Story 3.2/3.8) reads Config's `monthlyBudget` live and is the real-time blocking gate. This story's `AWS::Budgets::Budget` is a CloudFormation resource whose dollar limit is fixed at synth/deploy time — it cannot read a live DynamoDB value without a custom resource, which is unjustified complexity for a secondary, non-blocking safety net. Both currently default to $30 (`scripts/seed-config.mjs` / `MONTHLY_BUDGET_CEILING_USD`); if Tony changes one via Story 4.3's future Admin Dashboard editor, the other does not follow automatically. This is the same shape of tradeoff AD-6 already accepts for "AWS Budgets... billing data lags too far behind real time" — a secondary net is allowed to be looser than the primary gate.
3. **No branch-guard logic for `staging`/`main`.** Per Architecture AD-11, `staging`/`main` will eventually be fully isolated Amplify Hosting branch environments. Because `AWS::Budgets::Budget` tracks real *account-level* AWS cost (not anything stack-scoped), if this code were deployed unconditionally to multiple persistent branch environments in the same AWS account, each would create its own Budget watching the same underlying dollar figure — Tony would get duplicate notifications when the real threshold crosses (not incorrect, just noisy). Today, this repository has **no standing `staging`/`main` branches** — every deploy so far is a single `npx ampx sandbox` environment that Tony creates and tears down (confirmed via grep across every prior story record). Building speculative `process.env.AWS_BRANCH`-based guard logic now, for environments that don't exist yet, is the kind of premature constraint this project's owner has explicitly said to avoid on a solo-owned codebase. Recorded as an accepted, revisit-if-it-actually-happens gap (Task 4's deferred-work entry), not solved here.
4. **Fixed, non-interpolating email copy**, matching `orientation-alert`'s established convention exactly, even though (unlike the orientation pipeline's alarms) a Budgets SNS message carries no Session-derived content that needs protecting. Chosen for consistency and simplicity — one alert-email policy across the codebase, not two.

### What already exists — reuse, don't rebuild

- **`orientation-alert/{resource.ts,handler.ts,handler.test.ts}`** — the exact pattern this story's `budget-alert` Lambda copies: DI shape, `ACCESS_FROM_EMAIL`/`CUTOUT_EMAIL` secrets, `SESv2Client`/`SendEmailCommand`, fixed non-interpolating copy, SNS-event validation guards.
- **The alarm→SNS→Lambda→SES pipeline shape in `backend.ts`** — `workerFailureTopic`, `alertDeliveryDeadLetterQueue`, `alertCfnFunction.deadLetterConfig`, `LambdaSubscription` with a DLQ, and `alertLambdaErrorAlarm` are all direct templates for this story's new topic/DLQ/subscription/alarm. Six alarms already feed `workerFailureTopic`; this story adds one more Lambda's Errors alarm to the same topic (a different alert Lambda, same failure-escalation channel).
- **`backendNamespace`/`backendName` CDK context** (`accountTable.node.tryGetContext('amplify-backend-namespace'/'amplify-backend-name')`) — already used to build unique SSM parameter paths per environment; reuse the identical pair to build a unique Budget name, since `AWS::Budgets::Budget` names must be unique per account and multiple sandboxes could otherwise collide.
- **`dataStack.formatArn({ service: 'ses', resource: 'identity', resourceName: '*' })`** — the existing wildcard SES policy pattern, reused verbatim for the new Lambda's SES grant.

### Architecture compliance checklist (the ADs/NFRs that bind this story)

- **AD-4 (thin Lambda boundaries):** `budget-alert` is one Lambda, one responsibility (relay a fixed alert email), no shared abstraction with `orientation-alert` — a sibling, not an import.
- **AD-6:** this story implements exactly the "secondary safety net" AD-6 already names; it does not touch the two-phase atomic reservation (primary gate) at all.
- **NFR3 (Observability):** this is *the* push-based exception NFR3 carves out — "Tony must not have to remember to check the dashboard to learn the cost ceiling is at risk." AC 1 is that exception, implemented.
- **NFR6 (Cost ceiling):** the $30/80% constants mirror NFR6's own stated hard constraint.
- **No new Amplify Data model, no new top-level DynamoDB table, no schema change** — nothing here touches AD-8's fixed model set.
- **Privacy (NFR7 / project-context):** N/A in the strict sense (no Context/Guide content anywhere near this path), but the fixed-copy convention is preserved anyway for consistency (scope decision 4).

### Previous story intelligence (3.5)

- **Test rigor bar:** 3.5's code review round penalized vague/loose test assertions and rewarded exact-value assertions (e.g. exact DynamoDB expression strings). Task 1's `handler.test.ts` should assert the *exact* Subject/Body strings and the exact `Destination`/`FromEmailAddress` shape, not a partial/loose match — same bar `orientation-alert/handler.test.ts` already sets.
- **Isolated-commit discipline:** verify baseline commit + clean tree before starting (3.4's Task 0 lesson, repeated in 3.5); if uncommitted pre-existing changes exist, land them separately first.
- **"Outcome-phrased" live verification:** 3.5's Task 6 names observable outcomes (score appears on the row, counters move exactly once) rather than "the API call succeeded." This story's Task 3 follows the same discipline: the observable outcome is "the fixed-copy email arrives," not "the SNS publish call returned 200."
- **No Tavily/worker-redeploy risk here.** Unlike 3.5, this story never touches `orientation-guide`, so the standing Tavily-secret-staleness gotcha (3.3/3.8/3.5) does not apply — no alias-qualified probe needed.

### Git intelligence

Recent history (`49682b3` back through `609ef44`) is Story 3.5's implementation + two review-hardening commits, all backend/`amplify/**` work with no `src/` changes — the same shape this story takes. Patterns to inherit: one isolated story commit on `main` (plus a separate commit for any pre-existing dirty-tree work found at Task 0); `chore:`/`feat:`/`fix:`/`test:`/`docs:` commit-message prefixes; review rounds expect exact-value test assertions, not loose partial matches.

### Latest tech notes (verified against the installed toolchain 2026-07-25)

- `aws-cdk-lib/aws-budgets` ships bundled with the already-installed `aws-cdk-lib` — no new npm dependency. Verified by reading `node_modules/aws-cdk-lib/aws-budgets/lib/budgets.generated.d.ts` directly (exports `CfnBudget`, `CfnBudgetsAction`) rather than assuming.
- `CfnBudget`'s property shape (`budget: BudgetDataProperty`, `notificationsWithSubscribers: NotificationWithSubscribersProperty[]`) and its nested `SubscriberProperty`/`NotificationProperty`/`SpendProperty` field names were read directly from the installed type definitions, not from memory — use those exact casings (`budgetType`, `timeUnit`, `budgetLimit.amount`/`.unit`, `notificationType`, `comparisonOperator`, `threshold`, `thresholdType`, `subscriptionType`, `address`).
- **Region:** no us-east-1 (or other) region restriction applies to `AWS::Budgets::Budget` or its SNS topic. This was worth checking explicitly — AWS Budgets is often confused with the older, genuinely us-east-1-restricted CloudWatch *Billing Alarms* metric, which is a different, unrelated mechanism this story doesn't use. Confirmed by reading two independent working CDK+Budgets+SNS reference implementations (web-checked 2026-07-25): [jeroenreijn.com](https://www.jeroenreijn.com/2025/08/enabling-aws-budget-notifications-with-sns-using-aws-cdk.html) and [dzone.com](https://dzone.com/articles/aws-budget-notifications-sns-cdk) — neither pins a region for the topic or the budget stack. Task 3's deploy is still the real verification, but this is not expected to be a blocker.
- **SNS resource-policy pattern:** the dzone.com reference implementation's exact confused-deputy-hardened policy (`sns:Publish` scoped by `aws:SourceAccount` + `aws:SourceArn: arn:aws:budgets::<account>:*`) is what the Contract values table's "Topic → Budgets publish permission" row specifies — read directly from that working example rather than assumed, since a bare `grantPublish(ServicePrincipal)` would not include this scoping.

### Project Structure Notes

- New: `amplify/functions/budget-alert/{resource.ts,handler.ts,handler.test.ts}`.
- Updated: `amplify/backend.ts` (new imports, DLQ, topic, subscription, alarm, SES policy, `CfnBudget`, two new constants, `defineBackend` entry), `_bmad-output/implementation-artifacts/{deferred-work.md,sprint-status.yaml}`, this story file.
- NOT touched: everything under `src/**` and its tests, `e2e/**`, `playwright.config.js`, `amplify/data/resource.ts`, `amplify/functions/orientation-guide/**`, `amplify/functions/orientation-judge/**`, `amplify/functions/orientation-reconciler/**`, `amplify/functions/start-orientation-guide/**`, `amplify/functions/usage-counter/**`, `amplify/functions/orientation-alert/**` (read as a reference, not modified), `scripts/**`, `package.json`, `vite.config.js`. If the diff grows a file from this list, something went off-spec.

### References

- [Source: epics.md#Story-3.6] — the 2 ACs verbatim; [#Epic-3] FRs/ADs/NFRs-covered header; [#Requirements-Inventory] FR10/NFR3
- [Source: ARCHITECTURE-SPINE.md#AD-6] — "AWS Budgets + SNS remains the secondary safety net" (the exact mechanism this story builds); [#AD-4] thin-Lambda-boundary rule
- [Source: _bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/prd.md line 213] — "push, not just dashboard pull — e.g. email/SMS alert" (source of the email/SMS scope note)
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml] — the "Manual AWS Budgets tripwire before real spend begins... until FR10 alerting exists" action item (epic 2, status done) this story formalizes into code
- [Source: amplify/backend.ts] — every existing alarm/topic/DLQ/subscription/SES-policy pattern this story mirrors (read in full during story creation)
- [Source: amplify/functions/orientation-alert/{resource.ts,handler.ts,handler.test.ts}] — the exact sibling pattern this story's new Lambda copies (read in full during story creation)
- [Source: node_modules/aws-cdk-lib/aws-budgets/lib/budgets.generated.d.ts] — `CfnBudget`/`CfnBudgetProps` property shapes, read directly rather than assumed
- [Source: node_modules/aws-cdk-lib/aws-sns/lib/topic-base.d.ts] — `grantPublish(IGrantable)` signature
- [Source: scripts/seed-config.mjs] — Config's `monthlyBudget: 30` default, mirrored by `MONTHLY_BUDGET_CEILING_USD`
- [Source: _bmad-output/implementation-artifacts/3-5-score-orientation-guide-groundedness-async.md] — previous-story intelligence: test rigor bar, Task 0 discipline, outcome-phrased verification
- Web-checked 2026-07-25: [jeroenreijn.com — Enabling AWS Budget Notifications with SNS using AWS CDK](https://www.jeroenreijn.com/2025/08/enabling-aws-budget-notifications-with-sns-using-aws-cdk.html) and [dzone.com — Enable AWS Budget Notifications With SNS Using AWS CDK](https://dzone.com/articles/aws-budget-notifications-sns-cdk) — region-restriction check and the confused-deputy SNS resource-policy pattern

## Dev Agent Record

### Agent Model Used

GPT-5

### Implementation Plan

- Isolate the pre-existing Story 3.5 closeout and Story 3.6 creation artifacts before implementation.
- Add the budget-alert Lambda test-first by mirroring the established orientation-alert dependency-injection and fixed-copy contract.
- Wire the AWS Budget, hardened SNS policy, Lambda delivery/DLQ, SES permission, and alert-path alarm in the operational stack.
- Deploy once, inspect the live budget resources, and manually publish only after an untouched-deploy no-alert sanity interval.

### Debug Log References

- 2026-07-25 live verification: sandbox deployment completed in 143.898 seconds. AWS Budgets reported the `$30.0` monthly COST budget, one ACTUAL/GREATER_THAN/80 notification, and one SNS subscriber; the subscriber lookup using the PERCENTAGE notification key succeeded. The topic policy had one confirmed subscription and exact budget ARN plus source-account conditions.
- 2026-07-25 no-alert sanity: the deployed budget-alert Lambda had zero invocations before the manual SNS publish.
- 2026-07-25 delivery-path test: the single prescribed SNS publish invoked budget-alert once; CloudWatch showed a clean START/END/REPORT in 353.39 ms with no exception. Tony confirmed the cutout mailbox received the exact fixed body with no raw test-message interpolation.

### Completion Notes List

- Task 0 complete: isolated the pre-existing artifacts in commit `b911829`; baseline 267/267 tests, lint, typecheck, and build passed on Node 24.9.0; AWS credentials were valid and Amplify listed both required email secrets.
- Task 1 complete: added the budget-alert Lambda with the established fixed-copy SNS-to-SES contract; the new three-case suite passed test-first and the full regression suite passed at 270/270 tests.
- Task 2 complete: wired the $30 monthly Budget and 80% ACTUAL threshold to an exact-budget-ARN/account-scoped SNS topic, budget-alert Lambda/DLQ, SES policy, and Lambda Errors alarm; 270/270 tests, lint, typecheck, build, and diff checks passed.
- Task 3 complete: deployed the sandbox; verified the live Budget, notification, SNS subscriber, hardened topic policy, no-alert precondition, and clean Lambda execution; Tony confirmed the exact fixed-copy email arrived.
- Task 4 closeout gates: 270/270 tests, lint, typecheck, build, and 4/4 Playwright tests passed; credential/account-id sweep was clean; accepted Config drift and parallel-environment duplication risks were recorded.

### File List

- _bmad-output/implementation-artifacts/3-6-alert-tony-when-the-monthly-budget-nears-its-ceiling.md
- _bmad-output/implementation-artifacts/deferred-work.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- amplify/backend.ts
- amplify/functions/budget-alert/handler.test.ts
- amplify/functions/budget-alert/handler.ts
- amplify/functions/budget-alert/resource.ts

## Change Log

- 2026-07-25: Story created via create-story workflow — status ready-for-dev.
- 2026-07-25: Review pass (checklist-driven, web-verified) — fixed 3 critical issues (unscoped SNS resource-policy grant hardened with confused-deputy conditions per a verified working CDK reference; missing `budgetAlertLambda` local-const declaration made explicit; missing CDK construct ids added for the new DLQ/Budget/Alarm), corrected an overcautious region-restriction hedge after checking two working reference implementations, and restructured the fixed email copy into its own Copy section. Status remains ready-for-dev.
- 2026-07-25: Second review pass — the `budgetAlertLambda` const-declaration fix from round 1 had only reached the contract table, not the actual Task 2 checklist (which still used the variable without ever declaring it); added an explicit Task 2 bullet. Also tightened the SNS resource policy's `aws:SourceArn` condition from the reference implementation's account-wide wildcard to the exact budget ARN, via a new shared `monthlyBudgetName` computed once and reused by both the policy and the `CfnBudget`. Status remains ready-for-dev.
