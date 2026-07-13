---
baseline_commit: 481243313b25f8cbd460f20fa980d7119d573016
---

# Story 1.2: Grant one Invite Key onward (First-Gen only)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a First-Gen Account holder,
I want to generate one Invite Key to give to a friend,
so that I can bring someone I know into tarot-spa.

This is the second backend story. Story 1.1 stood up the entire Amplify Gen 2 backend (Cognito, Account/InviteKey models, post-confirmation redemption trigger, WAF, the SSM table-name bridge); this story adds the first **client-invoked authenticated mutation** — the `invite-key-mint` Lambda's onward-key path (AD-17) — plus the first authenticated UI affordance beyond the spread flow. Story 4.2 later adds the admin-mint path to this same Lambda; build only the onward path now.

## Acceptance Criteria

1. **Given** a First-Gen Account that hasn't generated its onward key yet, **when** they trigger "Grant Invite Key", **then** a new unredeemed Second-Gen InviteKey is created and shown as a copyable code (UX-DR5, UX-DR14).
2. **Given** a First-Gen Account that has already generated its onward key, **when** they view the Grant Invite Key action, **then** it's disabled/hidden with a plain confirmation they've already granted it — not an error.
3. **Given** a Second-Gen Account, **when** they look anywhere in the UI for a way to generate an onward key, **then** no such action exists.
4. **Given** two rapid duplicate-submit clicks on "Grant Invite Key" from the same First-Gen Account, **when** both requests race, **then** only one InviteKey is ever created (AD-17 atomicity).
5. **Given** a Second-Gen account calls the mint mutation directly, bypassing the UI, **when** the request reaches the Lambda, **then** it's rejected server-side regardless of UI affordance (AD-17).

[Source: epics.md#Story-1.2]

## Tasks / Subtasks

- [x] **Task 1: Add the `mintOnwardKey` custom mutation to the Data schema** (AC: 1, 4, 5)
  - [x] In `amplify/data/resource.ts`, add `mintOnwardKey: a.mutation().returns(a.string()).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(inviteKeyMint))` — authenticated-only (userPool), NOT `publicApiKey`. Follows the existing `checkInviteKey` custom-operation pattern in the same file.
  - [x] The mutation takes **no arguments**. The acting account is derived server-side from the caller's identity — never from a client-supplied id (a client-supplied id would let anyone mint against another account).
  - [x] The InviteKey model's deny-all rule (`allow.authenticated().to([])`) stays untouched — custom operations carry their own auth rules; this is exactly how `checkInviteKey` already coexists with it.
- [x] **Task 2: Build the `invite-key-mint` Lambda** (AC: 1, 4, 5)
  - [x] Create `amplify/functions/invite-key-mint/resource.ts` (`defineFunction({ name: 'invite-key-mint', resourceGroupName: 'data' })`) + `handler.ts`. **`resourceGroupName: 'data'` is critical** — see Dev Notes "Which table-name mechanism to use."
  - [x] Handler reads the caller's Cognito `sub` from `event.identity.sub` (AppSync userPool-auth resolver event). If absent, throw — this mutation is never legitimately unauthenticated.
  - [x] Generate the key code server-side: crypto-random, URL/copy-friendly, e.g. three groups of 4 uppercase base32-ish chars (`XXXX-XXXX-XXXX`) from `node:crypto` `randomBytes` — no external dependency. The code is the InviteKey's `id` (Story 1.1 established id-as-code).
  - [x] One atomic `TransactWriteCommand` with exactly two items (AD-17 — this transaction IS AC 1, 4, and 5):
    1. `Update` on Account (key: caller's `sub`): `ConditionExpression: #generation = :firstGen AND #onwardKeyGenerated = :false`, `SET #onwardKeyGenerated = :true`. Use `ExpressionAttributeNames` aliases for both attributes (same defensive pattern as 1.1's `#status`) — don't gamble on the DynamoDB reserved-word list; a wrong guess only surfaces as a live `ValidationException` that mocked unit tests can't catch.
    2. `Put` on InviteKey: `{ id: <code>, status: 'unredeemed', generation: 'SecondGen' }`, `ConditionExpression: attribute_not_exists(id)` (collision guard on the random code).
  - [x] On `TransactionCanceledException` with `ConditionalCheckFailed` on the Account item: throw a clean, specific error (e.g. `Error('not eligible')` → surfaces as a GraphQL error). This single condition covers BOTH AC 5 (Second-Gen caller: `generation` check fails) and AC 4's loser (repeat click: `onwardKeyGenerated` check fails). Do not distinguish them server-side — eligibility is one atomic predicate, per AD-17.
  - [x] On success, return the key code string (the mutation's `a.string()` return value).
  - [x] Eligibility is NEVER derived by querying InviteKey records (AD-17 explicitly forbids it) — the Account condition is the sole gate.
  - [x] Use the same dependency-injection shape as `amplify/auth/post-confirmation/handler.ts` (`createHandler(deps)` with a `CommandClient` type, module-level default deps) so unit tests inject mocks identically. Duplicate the small `isConditionalFailure` helper rather than importing across function directories (AD-4: no shared abstraction layer between functions).
- [x] **Task 3: Wire IAM + env in `backend.ts`** (AC: 1)
  - [x] The Lambda is in the `data` resource group → same-stack live construct refs are safe (this is the `checkInviteKey` precedent at `amplify/backend.ts:22-25`, NOT the post-confirmation SSM bridge). Grant via `accountTable.grantWriteData(...)` / `inviteKeyTable.grantWriteData(...)` or an explicit `PolicyStatement` with the live `tableArn`s, and pass `ACCOUNT_TABLE_NAME`/`INVITE_KEY_TABLE_NAME` env vars from the live `tableName` props directly. **No SSM parameters, no wildcard ARNs, no plain-string workarounds for this Lambda** — those exist solely because post-confirmation lives in the `auth` stack.
  - [x] No WAF change: the existing rate-limit rule is scoped to requests containing `checkInviteKey`; this mutation is userPool-authenticated and doesn't need the public-oracle protection.
- [x] **Task 4: Frontend — read own Account, minimal account affordance, Grant Key action** (AC: 1, 2, 3)
  - [x] New util `src/utils/account.js` (named exports, camelCase per project-context): `getMyAccount()` using `generateClient()` with **default (userPool) auth mode** — NOT `authMode: 'apiKey'` (that's only for the public pre-check in `inviteKeys.js`). `client.models.Account.list()` returns at most the caller's own record under the owner-auth rule; take the first item. Reads work because Story 1.1's review set Account auth to `allow.owner().identityClaim('sub').to(['read'])`.
  - [x] Add `mintOnwardKey()` to `src/utils/inviteKeys.js` (or the new util — keep both invite-key ops together in `inviteKeys.js`): `client.mutations.mintOnwardKey()` with default userPool auth; throw on GraphQL errors like the existing `checkInviteKey` does.
  - [x] New component `src/components/GrantInviteKey.jsx` (flat, PascalCase, default export, no subfolder): renders nothing at all unless the account is `FirstGen` (AC 3 — hidden entirely, per EXPERIENCE.md "hidden, not blocked"). For `FirstGen` + `onwardKeyGenerated: false`: a "Grant Invite Key" `button-secondary`-style action. After a successful mint: show the returned code in the Key/Code Display treatment + a "copy it now, it won't be shown again" note (InviteKey records are client-unreadable by design — deny-all auth — so the code is only ever visible in this one response). For `onwardKeyGenerated: true` (or after the local mint completes and the user revisits): plain confirmation text ("You've already granted your key") — not an error styling (AC 2).
  - [x] Key/Code Display (UX-DR5, DESIGN.md `key-code-display`): monospace text on `bg-gray-800` chip with `border-gray-700`, matching `SpreadView.jsx`'s existing draw-code `<code>` chip classes exactly — copy that treatment, don't invent one.
  - [x] Disable the button while the mint request is in flight (reuse the `busy` + ref double-submit guard pattern from `SignUp.jsx` — AC 4's client half; the transaction condition is the real enforcement).
  - [x] If the mint mutation errors with the not-eligible failure (lost race / stale UI): re-fetch the account and render the already-granted state — per AC 2's "plain confirmation, not an error."
  - [x] Surface placement: `App.jsx`'s authenticated branch gets a minimal account bar/section hosting this component (the "account/profile area" — EXPERIENCE.md IA names it but no mock exists; keep it deliberately slim, e.g. a small header row above the existing SpreadSelector, dark-token styled per AC 7 conventions from Story 1.1). Preserve the existing SpreadSelector/SpreadView flow completely unchanged beneath it. Story 1.4 (logout) will land in this same area later — leave room, don't build it.
  - [x] Loading state: `App.jsx` already gates on `authState`; the account fetch happens inside the authenticated branch — do not block the whole app on it (render the spread flow immediately; the grant affordance appears when the account loads).
- [x] **Task 5: Tests** (AC: all)
  - [x] `amplify/functions/invite-key-mint/handler.test.ts` (mirror `post-confirmation/handler.test.ts`'s DI style): happy path — transaction has exactly 2 items, Account update condition string contains both `generation` and `onwardKeyGenerated` checks, Put item is `status: 'unredeemed', generation: 'SecondGen'` with `attribute_not_exists(id)`, returns the code; conditional-failure path → clean not-eligible error (covers AC 4 loser + AC 5); missing `event.identity.sub` → rejects without touching DynamoDB.
  - [x] `src/components/GrantInviteKey.test.jsx`: renders nothing for SecondGen account (AC 3); shows action for eligible FirstGen; shows code chip after successful mint (AC 1); shows plain already-granted confirmation for `onwardKeyGenerated: true` (AC 2); not-eligible mutation error → flips to already-granted state, no raw error text.
  - [x] All existing 16 tests keep passing; `npm run lint` and `npm run typecheck` clean (typescript-eslint now covers `amplify/**/*.ts`).
- [x] **Task 6: Live sandbox verification** (AC: 1, 2, 4, 5)
  - [x] The running `tonyreynolds` sandbox already has the perfect test subject: Tony's real account is `FirstGen` with `onwardKeyGenerated: false`. The sandbox watcher auto-redeploys on file save.
  - [x] Verify: mint from the UI → code displays; DynamoDB shows the new `SecondGen` unredeemed InviteKey and the Account flipped to `onwardKeyGenerated: true`; the affordance now shows the already-granted state; a direct second `mintOnwardKey` GraphQL call is rejected; (optional full-loop) redeem the minted key in an incognito window with a fresh email → new `SecondGen` Account created via Story 1.1's flow.

### Review Findings

- [x] [Review][Patch] Reset the isolated sandbox eligibility and repeat the authenticated UI mint/code-display verification — user selected this resolution for the incomplete Task 6 evidence.
- [x] [Review][Patch] Reject a successful mutation response that contains no code; otherwise the committed one-time key can be permanently hidden and the UI can offer another mint [src/utils/inviteKeys.js:10]
- [x] [Review][Patch] Maintain Amplify model timestamps in the mint transaction for both the Account update and new InviteKey record [amplify/functions/invite-key-mint/handler.ts:46]
- [x] [Review][Patch] Handle account refresh failure inside lost-race recovery so the click does not reject silently and leave stale eligibility visible [src/components/GrantInviteKey.jsx:26]
- [x] [Review][Patch] Normalize non-Error mutation rejections before inspecting their message [src/components/GrantInviteKey.jsx:27]
- [x] [Review][Patch] Handle unavailable or rejected Clipboard API writes and give the user actionable feedback [src/components/GrantInviteKey.jsx:39]
- [x] [Review][Patch] Do not permanently swallow the initial authenticated Account query failure; expose a retryable account-bar state [src/App.jsx:83]
- [x] [Review][Patch] Treat an omitted Account list payload safely instead of indexing undefined [src/utils/account.js:5]
- [x] [Review][Patch] Match the mandated existing SpreadView code-chip treatment exactly [src/components/GrantInviteKey.jsx:48]
- [x] [Review][Patch] Correct the invalid baseline SHA and synchronize the story Status with sprint tracking [1-2-grant-one-invite-key-onward-first-gen-only.md:2]
- [x] [Review][Patch] Fail fast with a clear configuration error when either mint Lambda table-name environment variable is empty [amplify/functions/invite-key-mint/handler.ts:23]
- [x] [Review][Patch] Treat a not-eligible refresh that still reports an eligible Account as unresolved instead of silently restoring the Grant action [src/components/GrantInviteKey.jsx:31]
- [x] [Review][Patch] Give AccountBar explicit loading/missing-account states and prevent overlapping retry requests [src/App.jsx:80]
- [x] [Review][Patch] Make the missing-Account state retryable and add focused AccountBar coverage for loading, missing, failure, and retry transitions [src/App.jsx:80]
- [x] [Review][Patch] Restore the mocked global Clipboard API reliably even when a component-test assertion fails [src/components/GrantInviteKey.test.jsx:116]
- [x] [Review][Patch] Assert the complete atomic transaction value map and shared timestamp invariant in the mint-handler test [amplify/functions/invite-key-mint/handler.test.ts:28]
- [x] [Review][Patch] Add a behavioral test proving rapid repeated clicks invoke the mint mutation only once [src/components/GrantInviteKey.test.jsx:14]
- [x] [Review][Patch] Make AccountBar loading, missing, and query-failure states explicit live/alert announcements rather than unlabeled asynchronous text or a bare retry button [src/App.jsx:107]
- [x] [Review][Patch] Make the one-time Invite Key keyboard-selectable and label copy success as an accessible status [src/components/GrantInviteKey.jsx:56]
- [x] [Review][Patch] Record the user-supplied UI-minted code and exact DynamoDB verification in the debug log so Task 6 completion is auditable [1-2-grant-one-invite-key-onward-first-gen-only.md:151]
- [x] [Review][Patch] Make AccountBar retry tests await and assert the unique settled state instead of pre-existing header text or unresolved React work [src/App.test.jsx:27]

## Dev Notes

### Which table-name mechanism to use — read this before touching backend.ts

Story 1.1 ended up with **two different mechanisms** for Lambdas to reach the tables, and picking the wrong one here wastes a day:

- **`auth`-stack Lambdas (post-confirmation only):** can't reference data-stack constructs (genuine `auth`↔`data` CloudFormation cycle — see 1.1's Debug Log). They use the **SSM parameter bridge**: data stack publishes real table names to `/tarot-spa/<env>/…` params; Lambda resolves at cold start; IAM uses plain-string prefix wildcards (`table/Account-*`).
- **`data`-group Lambdas (`checkInviteKey`, and THIS story's `invite-key-mint`):** same nested stack as the tables → **direct live refs are safe and correct**. `checkInviteKey` at `amplify/backend.ts:22-25` is the template: `grantReadData` + `addEnvironment('INVITE_KEY_TABLE_NAME', inviteKeyTable.tableName)`. Do exactly that (write grants for this story). Do NOT copy the SSM/wildcard pattern here — it's the workaround, not the paradigm.

Also learned in 1.1 (the hard way): custom physical table names are impossible in Amplify Gen 2 (the managed-table role can only create default-named tables), and `.tableName` on `AmplifyDynamoDbTableWrapper` is a silent no-op. Tables have Amplify default names (`Account-<apiId>-NONE`); never hardcode or reconstruct them.

### Other Story 1.1 learnings that bind this story

- **`TransactWriteCommand` + `@aws-sdk/lib-dynamodb` is the established transaction pattern** — see `amplify/auth/post-confirmation/handler.ts` for the exact `isConditionalFailure` / `TransactionCanceledException` handling and the DI (`createHandler(deps)`) test seam. Mirror it; don't import from it (AD-4 forbids cross-function shared layers).
- **Account client-side auth is `allow.owner().identityClaim('sub').to(['read'])`** — read-only by design (Amplify's own deploy warning drove this: writable owner auth would let a user rewrite their own `generation`, which is precisely what this story's server-side condition protects). All Account writes go through Lambda IAM. Do not add client write access to make the UI simpler.
- **InviteKey client-side auth is deny-all** (`allow.authenticated().to([])`) — the client can never read InviteKey records; the minted code exists client-side only in the mutation response. This is why the UI must tell the user to copy it immediately.
- **`generateClient({ authMode: 'apiKey' })` is ONLY for the public pre-check.** Everything authenticated uses `generateClient()` (userPool default). Getting this wrong produces confusing Unauthorized errors.
- **Frontend conventions:** plain JSX, no TS in `src/`, default exports for components, named exports for utils, `useState`/`useRef` only, prop-drilling from `App.jsx`, exact dark tokens from Story 1.1's `SignUp.jsx` (`bg-gray-950`/`bg-gray-900`/`border-gray-700`/`indigo` accents, visible focus rings, labels on every input).
- **Test setup exists:** Vitest + RTL, `jsdom`, `src/test/setup.js`, 16 passing tests. `npm test`, `npm run lint`, `npm run typecheck` must all stay green — typecheck now genuinely covers `amplify/**` (it caught 1.1's worst bug; treat its output as load-bearing).
- **Sandbox flow:** `npx ampx sandbox` watcher redeploys on save; `amplify_outputs.json` is gitignored and regenerated; seed keys with `npm run seed-invite-key -- <env-name> [code]` (resolves the table via SSM itself).

### Architecture constraints (the spine rules this story implements)

- **AD-17 verbatim:** onward-key mint = one atomic conditional `UpdateItem` on Account (`generation = FirstGen AND onwardKeyGenerated = false`, set `true`) **in the same transaction as** creating the InviteKey record; eligibility never derived from InviteKey queries. Tony's admin mint (Story 4.2) is a separate mutation on this same Lambda later — no eligibility condition on that path; don't build it now, but don't structure the handler so a second entry point is impossible either.
- **AD-4:** thin Lambda-per-capability, direct SDK calls, no repository/DAO/DI-container layers; client-facing mutations never write these records directly.
- **AD-9:** admin gating (4.2) will be a Cognito group check — irrelevant to the onward path except as a reminder that `mintOnwardKey` needs no group logic.
- **UX-DR5/UX-DR14 + EXPERIENCE.md State Patterns:** copyable `key-code-display` chip; already-used → disabled/hidden + plain confirmation; Second-Gen → surface hidden entirely; mint failure → clear inline error, action stays retryable ("an Invite Key either exists, unredeemed, or it doesn't" — the transaction guarantees no partial state).
- **Voice & Tone:** plain, specific copy. No mystical flourish (no Ornamental Divider here — it's exclusive to the two LLM-touching screens).

### Project Structure Notes

- New: `amplify/functions/invite-key-mint/{resource.ts,handler.ts,handler.test.ts}` (kebab-case dir per spine conventions), `src/components/GrantInviteKey.jsx` + test, `src/utils/account.js`.
- Updated: `amplify/data/resource.ts` (mutation), `amplify/backend.ts` (grants/env — data-group section, near the checkInviteKey wiring), `src/App.jsx` (minimal authenticated account bar; existing flow untouched), `src/utils/inviteKeys.js` (mint call).
- `src/App.jsx` current state: `authState` gate (`loading`/`unauthenticated`/`authenticated`) via `getCurrentUser` + `Hub.listen`; authenticated branch renders `SpreadView`/`SpreadSelector` unconditionally. This story only wraps the authenticated branch with the slim account area — every existing handler (`handleSelect`/`handleDrawAgain`/`handleBack`/`handleLoadCode`) and the draw-code flow must keep working unchanged.

### References

- [Source: epics.md#Story-1.2] — story + ACs
- [Source: ARCHITECTURE-SPINE.md#AD-17] — atomic eligibility, same-transaction mint
- [Source: ARCHITECTURE-SPINE.md#AD-4, #AD-9] — Lambda paradigm, auth split
- [Source: ARCHITECTURE-SPINE.md#Structural-Seed] — `amplify/functions/invite-key-mint/` placement
- [Source: EXPERIENCE.md#Component-Patterns, #State-Patterns] — Grant Key behavior, hidden-not-blocked, already-used state
- [Source: DESIGN.md#components.key-code-display] — monospace chip spec (match `SpreadView.jsx`'s draw-code chip)
- [Source: _bmad-output/implementation-artifacts/1-1-redeem-an-invite-key-to-create-an-account.md#Review-Findings, #Live-Sandbox-Findings] — SSM bridge vs data-group refs, auth rules as-built, DI test pattern, sandbox verification flow
- [Source: prd.md#FR-2] — one onward key per First-Gen, no Second-Gen path
- [Source: project-context.md] — frontend conventions

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Add the authenticated no-argument mutation and a thin Data-group Lambda using one conditional DynamoDB transaction.
- Keep eligibility exclusively on Account generation/onward state; return the generated code only from the successful mutation.
- Add the authenticated Account reader and a hidden-for-SecondGen grant affordance without blocking the existing tarot flow.
- Cover atomicity and UI states with Vitest/RTL, then deploy and verify the sandbox transaction and rejection paths.

### Debug Log References

- 2026-07-12: Red phase confirmed both new suites failed because `invite-key-mint/handler.ts` and `GrantInviteKey.jsx` did not exist.
- 2026-07-12: Green phase passed 24/24 full regression tests; `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- 2026-07-12: Existing sandbox watcher (PID 30832) deployed the changes; CloudFormation reached `UPDATE_COMPLETE` and generated the `invite-key-mint` Lambda.
- 2026-07-12: Browser plugin execution was unavailable because its backend rejected required sandbox metadata, so authenticated visual UI verification could not be performed.
- 2026-07-12: Direct live Lambda invocation for Tony's eligible FirstGen account returned `Z4MX-54WB-RGE3`; DynamoDB confirmed the Account flag changed to `true` and exactly one unredeemed SecondGen InviteKey was created.
- 2026-07-12: A duplicate invocation and an invocation for sandbox account `story-1-2-secondgen-test` both returned `Error('not eligible')`.
- 2026-07-12: Diagnosed the missing account affordance as Story 1.1 Account records lacking Amplify model timestamps; added a failing regression assertion, updated post-confirmation Account writes, and backfilled Tony's sandbox Account.
- 2026-07-12: Tony confirmed the authenticated UI now renders the plain "You've already granted your key" state.
- 2026-07-12: After the sandbox eligibility reset, Tony clicked the authenticated UI action and supplied returned code `W32D-UVPH-2QBY`; a consistent DynamoDB read confirmed that exact unredeemed SecondGen InviteKey plus Tony's Account flag and matching timestamps.

### Completion Notes List

- Implemented authenticated `mintOnwardKey` with no client-supplied account id.
- Implemented atomic Account eligibility update + SecondGen InviteKey creation with collision protection and clean not-eligible handling.
- Added same-stack write IAM/environment wiring without changing the public pre-check WAF rule.
- Added authenticated Account lookup, grant UI, one-time copyable code display, double-submit guard, stale-race refresh, and hidden SecondGen behavior.
- Live backend verification passed for success, duplicate rejection, and SecondGen rejection; the authenticated visual UI mint/code-display pass is also complete.
- Code review patches hardened missing-code, refresh, clipboard, Account loading, and Amplify timestamp behavior; final UI mint returned `W32D-UVPH-2QBY` and its exact DynamoDB state was verified.
- Re-review patches added Lambda configuration validation, unresolved stale-race feedback, and explicit non-overlapping Account loading/retry states; 29 tests pass.
- Third-pass patches made missing-account recovery retryable and added focused AccountBar, double-click, transaction-value, and clipboard-isolation coverage; 32 tests pass.
- Fourth-pass patches added accessible async account/copy announcements, keyboard-selectable code, and an auditable live-verification record; 32 tests pass.
- Fifth-pass patch made AccountBar retry tests await and verify their true settled UI state; 32 tests pass.

### Change Log

- 2026-07-12: Addressed all 10 code-review patches and completed live authenticated UI mint verification.
- 2026-07-12: Addressed all 3 second-pass code-review findings; acceptance audit remained clean.
- 2026-07-12: Addressed all 4 third-pass code-review findings; acceptance audit remained clean.
- 2026-07-12: Addressed all 3 fourth-pass code-review findings; edge-case and acceptance audits were clean.
- 2026-07-12: Addressed the single fifth-pass code-review finding; acceptance audit remained clean.

### File List

_bmad-output/implementation-artifacts/1-2-grant-one-invite-key-onward-first-gen-only.md
_bmad-output/implementation-artifacts/sprint-status.yaml
amplify/backend.ts
amplify/data/resource.ts
amplify/auth/post-confirmation/handler.test.ts
amplify/auth/post-confirmation/handler.ts
amplify/functions/invite-key-mint/handler.test.ts
amplify/functions/invite-key-mint/handler.ts
amplify/functions/invite-key-mint/resource.ts
src/App.jsx
src/App.test.jsx
src/components/GrantInviteKey.jsx
src/components/GrantInviteKey.test.jsx
src/utils/account.js
src/utils/inviteKeys.js
