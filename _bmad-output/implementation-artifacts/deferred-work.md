## Deferred from: code review of 1-4-log-out (2026-07-13)

- Remove the real invite key from repository artifacts and rotate or invalidate it if it remains redeemable. The same key was already committed in Story 1.2, so fixing the Story 1.4 copy alone would not remove the exposure.
  - **2026-07-16 (Epic 1 close-out): RESOLVED.** Both live-minted key codes (the UI mint from 1.2 and the earlier direct-Lambda test mint) redacted from all current story artifacts. The codes remain in git history, so live invalidation was the actual control: the direct-Lambda test key no longer existed in the sandbox table (removed during 1.2's eligibility reset), and the UI-minted key was still `unredeemed` — flipped to `revoked` via a conditional DynamoDB update, verified in the returned item. Note: Tony's account remains `onwardKeyGenerated: true`, so his one onward grant is spent on this revoked key; if a real onward key is ever needed in this sandbox, reset the flag or use the seed script.

## Recorded for Story 3.2 (2026-07-18)

- **Bedrock Claude Opus inference-profile ID (sandbox account, us-east-1): `us.anthropic.claude-opus-4-6-v1`.** Confirmed working by Tony via a live `bedrock-runtime converse` smoke call. This is the identifier the orientation-guide Lambda must pass as `modelId` (AD-5 implementation detail flagged by the tech-verification review: current-gen Opus requires the cross-region `us.` inference-profile form, not the bare foundation-model ID).
- **Production rollout:** run `npm run seed-config -- <env-name>` once after the Story 3.2 schema first deploys to each staging/main environment. The conditional seed creates Config `global` with `dailyLimit: 5` and `monthlyBudget: 30` without clobbering later Story 4.3 edits.

## Tracked from: Story 1.1 review, accepted-as-is (2026-07-12)

- AppSync API key (`apiKeyAuthorizationMode: { expiresInDays: 30 }`) has no rotation plan. Both public operations, `checkInviteKey` and `requestAccess`, authenticate with this key, so new-signup key checks and access requests start failing ~30 days after each deploy unless the key is rotated (a redeploy regenerates it). Story 2.2 redeployed the sandbox on 2026-07-17 → nominal expiry ~2026-08-16.
  - **2026-07-17 (Epic 2 retro): DECIDED.** Keep apiKey auth with a rotation habit; a reminder email to the cutout address ahead of expiry is the tripwire (the cutout inbox is proven delivery infrastructure as of Story 2.2), and rotation happens via redeploy. Implementation tracked as an Epic 2 retro action item (owner: Tony).
