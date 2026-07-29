## Deferred from: code review of 1-4-log-out (2026-07-13)

- Remove the real invite key from repository artifacts and rotate or invalidate it if it remains redeemable. The same key was already committed in Story 1.2, so fixing the Story 1.4 copy alone would not remove the exposure.
  - **2026-07-16 (Epic 1 close-out): RESOLVED.** Both live-minted key codes (the UI mint from 1.2 and the earlier direct-Lambda test mint) redacted from all current story artifacts. The codes remain in git history, so live invalidation was the actual control: the direct-Lambda test key no longer existed in the sandbox table (removed during 1.2's eligibility reset), and the UI-minted key was still `unredeemed` — flipped to `revoked` via a conditional DynamoDB update, verified in the returned item. Note: Tony's account remains `onwardKeyGenerated: true`, so his one onward grant is spent on this revoked key; if a real onward key is ever needed in this sandbox, reset the flag or use the seed script.

## Recorded for Story 3.2 (2026-07-18)

- **Bedrock Claude Opus inference-profile ID (sandbox account, us-east-1): `us.anthropic.claude-opus-4-6-v1`.** Confirmed working by Tony via a live `bedrock-runtime converse` smoke call. This is the identifier the orientation-guide Lambda must pass as `modelId` (AD-5 implementation detail flagged by the tech-verification review: current-gen Opus requires the cross-region `us.` inference-profile form, not the bare foundation-model ID).
- **Production rollout:** run `npm run seed-config -- <env-name>` once after the Story 3.2 schema first deploys to each staging/main environment. The conditional seed creates Config `global` with `dailyLimit: 5` and `monthlyBudget: 30` without clobbering later Story 4.3 edits.

## Recorded for Story 3.8 (2026-07-19)

- **Lifecycle rollout:** run `npm run backfill-sessions -- <env-name>` once after the Story 3.8 Session lifecycle schema first deploys to each staging/main environment. The conditional, idempotent migration marks only legacy rows without `status` as `SUCCEEDED` and copies their existing `updatedAt` to `completedAt`.
- **Durable worker rollout:** the `live` alias automatically follows the worker's `currentVersion` on each deploy. In-flight durable executions remain pinned to the version on which they started; do not hand-pin or clean up a version while it still has an active execution.
- **Version-pinned Tavily verification:** always run the credential-safe provider probe against `orientation-guide:live`, not unqualified `$LATEST`. If Amplify leaves the secret stale, direct propagation repairs only `$LATEST`; publish that corrected configuration as a new immutable version and move `live` to it before any paid generation. A later Amplify deploy may replace that manual alias target with CDK's new `currentVersion`, so repeat the alias-qualified probe after every worker deploy.

## Deferred from: code review of 3-8-make-orientation-guide-generation-durable-and-asynchronous (2026-07-21)

- Strengthen the pre-existing Config snapshot validation so `dailyLimit` and `monthlyBudget` must be finite, positive, and appropriately integral/ranged instead of accepting every JavaScript `number`.
- Refresh the pre-existing Daily-limit UI state at the next UTC-day boundary so a tab left open overnight does not continue showing yesterday's exhausted state.

## Tracked from: Story 1.1 review, accepted-as-is (2026-07-12)

- AppSync API key (`apiKeyAuthorizationMode: { expiresInDays: 30 }`) has no rotation plan. Both public operations, `checkInviteKey` and `requestAccess`, authenticate with this key, so new-signup key checks and access requests start failing ~30 days after each deploy unless the key is rotated (a redeploy regenerates it). Story 2.2 redeployed the sandbox on 2026-07-17 → nominal expiry ~2026-08-16.
  - **2026-07-17 (Epic 2 retro): DECIDED.** Keep apiKey auth with a rotation habit; a reminder email to the cutout address ahead of expiry is the tripwire (the cutout inbox is proven delivery infrastructure as of Story 2.2), and rotation happens via redeploy. Implementation tracked as an Epic 2 retro action item (owner: Tony).

## Deferred from: code review of 3-4-redraw-from-the-results-screen (2026-07-24)

- "Tweak existing observation" clicked when the just-finished generation exhausted the daily limit lands on the spec'd Rate-Limited Intake (Quick Draw degrade) with the preserved Context invisible until the limit resets — an intersection of AC 1's always-present redraw buttons and UX-DR13's whole-screen degrade, not a code bug. Context is retained in App state and the redraw draft and resurfaces next day. Candidate UX polish: suppress or annotate the Tweak action when `rateLimited` is already known on Results.

## Recorded for Story 3.5 (2026-07-25)

- **Groundedness-judge rollout:** before Story 3.5 first deploys to each staging/main account and region, enable Bedrock Claude Haiku model access and smoke-confirm the configured inference-profile ID there, following the same protocol as the Opus rollout check.
- **Silent scored-rate watch:** the judge's clean-return leave-unset outcomes are alarm-invisible by design. When Story 4.1 adds the average `groundednessScore` metric, also watch scored Sessions versus total `SUCCEEDED` Sessions; a persistent slide toward zero signals a silently broken model-output contract or dispatch path.

## Recorded for Story 4.1 (2026-07-27)

- **Daily Orientation Limit hit-rate is intentionally all-time:** Story 4.1 presents DailyUsage records at the current Config limit with no time-window selector or trend view. Revisit this scope if Tony later wants weekly/monthly movement rather than one cumulative operational number.
- **`admin-metrics` uses unbounded full-table scans at friend-circle scale:** Account, Session, and DailyUsage are fully paginated and read in parallel, which is acceptable at current volume. Revisit with maintained counters, indexes, or another bounded aggregation design if table sizes make dashboard latency or read cost material.
- **Silent scored-rate watch — live baseline established, remains open:** the Story 4.1 sandbox check found 2 scored Sessions out of 16 total `SUCCEEDED` Sessions (12.5%), with average floater score `0.25`. The denominator includes legacy/pre-judge Sessions, so this one small snapshot cannot establish a broken judge path, but it is too low to close the watch. Compare the ratio again after more post-3.5 Sessions accumulate; a persistent slide toward zero remains the failure signal.

## Recorded for Story 3.6 (2026-07-25)

- **Config-vs-CDK budget-ceiling drift:** the in-app MonthlySpend gate reads Config's live `monthlyBudget`, while the secondary AWS Budget uses the independently maintained synth-time `MONTHLY_BUDGET_CEILING_USD` constant. Both currently use $30. Revisit if Story 4.3 ships and Tony wants Admin Dashboard budget edits to keep the AWS Budget synchronized.
- **Parallel-environment Budget duplication:** each future persistent `staging`/`main` environment in the same AWS account would create its own AWS Budget watching the same account-level spend, producing duplicate rather than incorrect notifications. Revisit only if persistent parallel environments are actually introduced and duplicate alerts begin occurring.

## Recorded for Story 3.7 (2026-07-25)

- **Authenticated Quick Draw round-trip state loss is accepted as-is (Tony, 2026-07-25):** `mode`, `context`, and `spreadKey` are all local `useState` in `ContextEntry`. Selecting a spread from Quick Draw calls `onQuickDrawSelect` → `App.handleSelect`, which unmounts `ContextEntry` in favor of `SpreadView`. Clicking `SpreadView`'s own `← Back` calls `App.handleBack`, which clears `spreadKey`/`cards` but never syncs `orientContext`/`orientSpreadKey` from what the user actually typed — so the remounted `ContextEntry` reseeds from stale `initialContext`/`initialSpreadKey` props. The user loses not just the `quickdraw` toggle position (resets to canonical `orient` mode) but also any Context text and Orient-mode spread pick entered before switching to Quick Draw. This is not a bug to fix absent a new requirement: AC 2 is satisfied by the direct `Back to Help Me Orient` button, which never unmounts `ContextEntry` and preserves Context/Spread state exactly. Do not lift `mode`/`context`/`spreadKey` into `App.jsx` or add sticky-mode state solely for this round trip.

## Deferred from: code review of story-3.6 (2026-07-25)

- **Fixed alert copy triplicated with no shared source of truth** — the exact Subject/Body strings are independently typed in `handler.ts`, `handler.test.ts`, and the story's Copy section; a wording change requires three synchronized edits. Inherited from `orientation-alert`'s established convention, not new to this story.
- **`SnsEvent` type omits the real `Sns` field** — tests bypass the type with an `as object` cast to inject SNS payload content; copied verbatim from `orientation-alert/handler.test.ts` rather than fixed at the source.
- **Test bundles three independent assertions in one `it` block** (`handler.test.ts` — missing config / wrong EventSource / empty Records) — if the first assertion fails for the wrong reason, the remaining two silently never execute. Extends a pattern `orientation-alert`'s own test already uses at smaller scale.
- **Handler assumes a well-formed event/record shape** — a null/undefined `event` or a malformed `Records` entry throws a raw `TypeError` instead of the intended configuration/validation error. Unreachable via real SNS invocations; same gap exists in `orientation-alert`.
- **No guard against `Records.length > 1`** — would send one email per record if SNS ever delivered a multi-record batch. SNS→Lambda subscriptions always deliver a single record per invoke in practice; `orientation-alert` has the identical gap.
- **Email config guard doesn't catch whitespace-only strings** — `!deps.fromEmail || !deps.cutoutEmail` treats `"   "` as configured. Inherited unchanged from `orientation-alert`.
- **`monthlyBudgetName` has no length/charset validation** against AWS Budget naming constraints, built from CDK context the same unguarded way the pre-existing `ssmPrefix` already is in the same file.
- **AWS Budget tracks whole-account spend, not tarot-spa specifically** — no `costFilters` on the `CfnBudget`. Accepted by Tony (2026-07-25): tarot-spa will be the account's dominant workload for at least the next few months. Revisit cost-filter scoping if/when other workloads share the account.

## Deferred from: code review of story-3.7 (2026-07-25)

- **No test covers deliberate Quick Draw entered via the "Load Draw" code field (`onLoadCode`)** — only the spread-button entry path is tested for AC 1's "no LLM call" guarantee. Pre-existing gap; Story 3.7's Task 1 explicitly scoped its one new test to the spread-button path.
- **Partial e2e credentials (`TAROT_E2E_EMAIL`/`TAROT_E2E_PASSWORD` set individually rather than as a pair) are not guarded against** — the authenticated Playwright project could attempt a login with a missing credential and fail ambiguously. Pre-existing e2e harness behavior.
- **`npm test` showed one flaky failure (`act()`/cleanup-related) on a single run during adversarial review** before passing clean on a rerun; a subsequent triage rerun was clean (271/271). Unconfirmed/non-reproducible so far; likely pre-existing suite flakiness unrelated to Story 3.7's diff.
