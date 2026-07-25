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
