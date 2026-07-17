## Deferred from: code review of 1-4-log-out (2026-07-13)

- Remove the real invite key from repository artifacts and rotate or invalidate it if it remains redeemable. The same key was already committed in Story 1.2, so fixing the Story 1.4 copy alone would not remove the exposure.
  - **2026-07-16 (Epic 1 close-out): RESOLVED.** Both live-minted key codes (the UI mint from 1.2 and the earlier direct-Lambda test mint) redacted from all current story artifacts. The codes remain in git history, so live invalidation was the actual control: the direct-Lambda test key no longer existed in the sandbox table (removed during 1.2's eligibility reset), and the UI-minted key was still `unredeemed` — flipped to `revoked` via a conditional DynamoDB update, verified in the returned item. Note: Tony's account remains `onwardKeyGenerated: true`, so his one onward grant is spent on this revoked key; if a real onward key is ever needed in this sandbox, reset the flag or use the seed script.

## Tracked from: Story 1.1 review, accepted-as-is (2026-07-12)

- AppSync API key (`apiKeyAuthorizationMode: { expiresInDays: 30 }`) has no rotation plan. The public `checkInviteKey` pre-check authenticates with this key, so new signups' key pre-check starts failing ~30 days after each deploy unless the key is rotated (a redeploy regenerates it). Current sandbox deploy dates from 2026-07-12 → nominal expiry ~2026-08-11. Decide before Epic 3: rotation habit, longer expiry, or move the pre-check off apiKey auth.
