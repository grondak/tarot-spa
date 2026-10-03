---
title: 'API Key Expiry Reminder'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '66c15b7'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `amplify/data/resource.ts` sets `apiKeyAuthorizationMode: { expiresInDays: 30 }` for the `checkInviteKey` query (also used by `RevokeInviteKey`'s admin lookup). Per epic-2/epic-3 retro decisions, a deploy regenerates the key and its 30-day clock, but nothing ever alerts Tony before it silently expires — and with Epic 4 (the last planned epic) now closed, there's no guaranteed deploy cadence left to accidentally refresh it. An expired key breaks public signup key-checking and the admin revoke lookup with zero warning.

**Approach:** A new scheduled Lambda (`amplify/functions/api-key-alert/`) runs daily, reads the live AppSync API key's actual expiration via `appsync:ListApiKeys`, and emails the existing cutout address when it's within a 7-day warning window — naming the concrete fix (redeploy). Mirrors the existing `budget-alert`/`orientation-reconciler` patterns already in `amplify/backend.ts` (thin injectable-dependency handler, SES email, EventBridge `Rule`+`Schedule.rate`).

## Boundaries & Constraints

**Always:** Reuse the existing `ACCESS_FROM_EMAIL`/`CUTOUT_EMAIL` secrets (no new secret). Mirror `budget-alert/handler.ts`'s `createHandler(deps)` injectable shape. Daily schedule (`Schedule.rate(Duration.days(1))`); 7-day warning window; both as named constants. Reuse the existing `workerFailureTopic` (already emailed via `orientationAlertLambda`'s subscription) for this Lambda's own error alarm — no new SNS topic/DLQ. The reminder email must name the fix: run `npx ampx sandbox --once` (or deploy) to regenerate the key.

**Ask First:** Nothing identified — defaults below are documented judgment calls, not blocking questions; flag disagreement rather than re-ask.

**Never:** No change to `amplify/data/resource.ts` (no new query/mutation — this Lambda is EventBridge-triggered only, not resolver-bound). No Admin Dashboard/frontend change. No new secret. No automatic self-rotation of the key (redeploy stays a human action, per the original retro decision). No persisted "already alerted" dedup state — repeat daily emails during the 7-day window are accepted (matches this project's no-extra-polish posture; a single admin inbox tolerates up to 7 daily emails).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Healthy key | soonest key `expires` > 7 days out | No email sent | N/A |
| Within window | soonest key `expires` <= 7 days out | One reminder email to `CUTOUT_EMAIL`, names days remaining and the redeploy fix | N/A |
| No active key | `ListApiKeys` returns an empty list | One urgent "no active API key found" email (worse than "expiring soon") | N/A |
| Multiple keys (mid-rotation) | 2+ keys returned | Soonest-expiring key determines the alert | N/A |
| Missing config | `APPSYNC_API_ID`/`ACCESS_FROM_EMAIL`/`CUTOUT_EMAIL` env/secret unset | Throws a clear config error before any AWS call | Zero AWS calls made |
| AppSync/SES call fails | SDK throws | Error propagates unchanged | Caught by the new Lambda-errors CloudWatch alarm -> `workerFailureTopic` -> existing email pipeline |

</frozen-after-approval>

## Code Map

- `amplify/functions/budget-alert/handler.ts` -- injectable-dependency handler shape to mirror
- `amplify/functions/orientation-reconciler/resource.ts` -- minimal scheduled-Lambda `resource.ts` shape to mirror
- `amplify/backend.ts:415-420` -- existing `Rule`/`Schedule.rate`/`LambdaFunctionTarget` precedent to mirror for the new daily schedule
- `amplify/backend.ts:290-321` -- existing per-Lambda error-alarm-to-`workerFailureTopic` precedent to mirror

## Tasks & Acceptance

**Execution:**
- [x] `amplify/functions/api-key-alert/resource.ts` -- `defineFunction({ name: 'api-key-alert', resourceGroupName: 'data', timeoutSeconds: 10, environment: { ACCESS_FROM_EMAIL: secret(...), CUTOUT_EMAIL: secret(...) } })` -- mirrors `budget-alert`
- [x] `amplify/functions/api-key-alert/handler.ts` -- `createHandler(deps)`: call `ListApiKeysCommand`, find soonest-expiring key (or treat empty list as maximally urgent), compute days remaining, send SES email if <= 7 days or no key found -- core logic
- [x] `amplify/functions/api-key-alert/handler.test.ts` -- cover every I/O matrix row, mutation-survivable -- required coverage bar for this project
- [x] `amplify/backend.ts` -- import/register `apiKeyAlert`; grant `appsync:ListApiKeys` scoped to `backend.data.resources.graphqlApi`'s apikeys resource and `ses:SendEmail` (existing wildcard identity pattern); add `APPSYNC_API_ID`/`WARNING_WINDOW_DAYS` env vars; create the daily `Rule`+`LambdaFunctionTarget`; add a Lambda-errors `Alarm` wired to `workerFailureTopic` (mirrors every other alert Lambda's error alarm)
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark the two open "API-key expiry reminder" action items (epic 2, epic 3) `done`. Note: marked done based on npm test/lint/typecheck/build passing only — not a live `npx ampx sandbox --once` deploy or real-email verification (no AWS credentials in the implementing session); that live check is still Tony's to perform.

**Acceptance Criteria:**
- Given the key's actual AppSync expiration is more than 7 days away, when the scheduled check runs, then no email is sent.
- Given the key's expiration is within 7 days (or no key exists), when the scheduled check runs, then exactly one email reaches the cutout address naming the remaining days (or "no key found") and the redeploy fix.
- Given this Lambda itself throws, then the existing error-alarm -> `workerFailureTopic` -> email pipeline surfaces it the same way every other alert Lambda's failures already do.

## Spec Change Log

## Design Notes

**Why daily, not the reconciler's 1-minute cadence:** this isn't latency-sensitive (7-day warning window), and a 30-day key doesn't need minute-level polling.

**Why no dedup/alert-once state:** adding persisted "already alerted today" tracking is real complexity (a table, or overloading an existing one) for a cosmetic noise reduction on a single-recipient inbox. Repeat daily emails for up to 7 days is the simpler, accepted tradeoff — same philosophy as this project's other "ugly but functional" admin-facing decisions.

**Why reuse `workerFailureTopic` instead of a new topic+DLQ:** this Lambda has no SNS *subscription* (it's EventBridge-triggered, not SNS-triggered like `budget-alert`/`orientation-alert`), so there's nothing to dead-letter — only a plain CloudWatch error-count alarm, which several other Lambdas already wire into the same shared topic.

## Verification

**Commands:**
- `npm test` -- expected: all existing + new `api-key-alert` tests pass
- `npm run lint` -- expected: clean
- `npm run typecheck` -- expected: clean
- `npm run build` -- expected: succeeds
- `npx ampx sandbox --once` -- expected: deploys the new Lambda, schedule rule, IAM grants, and alarm cleanly

**Manual checks (if no CLI):**
- Live-verify via a direct `aws lambda invoke` against the deployed `api-key-alert` function (same pattern Story 4.4 used) and confirm the email arrives at the cutout address when forced into the warning window (e.g. temporarily lower `WARNING_WINDOW_DAYS` for one invoke, or check against the real key's actual remaining days first).

## Suggested Review Order

**Core expiry-check logic**

- Entry point: the whole decision tree — no valid expiry data, already expired, expiring soon, or healthy.
  [`handler.ts:56`](../../amplify/functions/api-key-alert/handler.ts#L56)

- A negative days-remaining now sends a distinct "ALREADY EXPIRED" email instead of a confusing "-3 day(s)" message.
  [`handler.ts:83`](../../amplify/functions/api-key-alert/handler.ts#L83)

- Keys with a missing/non-numeric `expires` are filtered out before picking the soonest, instead of silently treated as epoch 0.
  [`handler.ts:69`](../../amplify/functions/api-key-alert/handler.ts#L69)

- `WARNING_WINDOW_DAYS=0` is now honored instead of falling back to the default via `||`.
  [`handler.ts:38`](../../amplify/functions/api-key-alert/handler.ts#L38)

**IAM and infrastructure wiring**

- Fixed IAM resource ARN for `ListApiKeys`: scoped to the API itself (`apis/{apiId}`), not a fabricated apikeys sub-resource that would have AccessDenied.
  [`backend.ts:380`](../../amplify/backend.ts#L380)

- New alarm catches the schedule silently failing to invoke the Lambda at all (zero-invocation case the error alarm alone can't see).
  [`backend.ts:349`](../../amplify/backend.ts#L349)

- Existing error-count alarm pattern, reused for this Lambda, wired to the shared `workerFailureTopic`.
  [`backend.ts:331`](../../amplify/backend.ts#L331)

- Daily EventBridge schedule driving the check, mirroring the only prior scheduled-Lambda precedent.
  [`backend.ts:391`](../../amplify/backend.ts#L391)

**Lambda configuration**

- Timeout raised from 10s to 30s to give two sequential AWS SDK calls (with retries) more margin.
  [`resource.ts:6`](../../amplify/functions/api-key-alert/resource.ts#L6)

**Tests**

- New coverage for the already-expired, missing-expiry-data, and warning-window-parsing edge cases found in review.
  [`handler.test.ts:1`](../../amplify/functions/api-key-alert/handler.test.ts#L1)

**Docs**

- Sprint-status entries set to `in-progress` (not `done`) pending Tony's own live AWS verification.
  [`sprint-status.yaml:109`](sprint-status.yaml#L109)
