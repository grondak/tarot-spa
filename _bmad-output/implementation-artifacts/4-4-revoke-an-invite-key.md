---
baseline_commit: 893c9ed
created: 2026-10-02
---

# Story 4.4: Revoke an Invite Key

Status: review

## Story

As Tony,
I want to revoke an Invite Key,
So that I can shut down a key that's been abused, leaked, or issued by mistake before it's redeemed.

*(No PRD FR number — FR1's own AC tests against a "revoked" key existing, but nothing in the original document built the capability that creates that state. Fourth and final planned story of Epic 4.)* Stories 4.1–4.3 already provide the `Admin` Cognito group, hidden/non-admin navigation behavior, the `AdminDashboard.jsx` shell, `MintInviteKey`, and `AdminConfigEditor`. Story 1.1 already built the `InviteKey` model (`status` enum already includes `unredeemed | redeemed | revoked`), the `checkInviteKey` public query, and the SignUp screen's three distinct rejection messages — including "This key was revoked," which already renders correctly today for any key whose stored `status` is `revoked`. This story only needs to produce that `revoked` status through an admin action; it does not touch redemption, SignUp, or Cognito.

## Acceptance Criteria

*(Verbatim from `epics.md#Story-4.4`; implementation clarifications below make the boundaries testable without changing these outcomes.)*

1. **Given** Tony is on the Admin Dashboard and selects an unredeemed Invite Key, **when** he revokes it, **then** its status changes to revoked and it can never be redeemed.
2. **Given** a key that's already been redeemed, **when** Tony looks for a way to revoke it, **then** the action is unavailable — revocation only applies to still-unredeemed keys.
3. **Given** a revoked key, **when** someone attempts to redeem it, **then** they see "This key was revoked" (Story 1.1) and no Account is created.
4. **Given** a non-admin Account, **when** they attempt to call the revoke mutation directly, **then** it's rejected server-side via the admin-group check (AD-9).

### Acceptance clarifications required by architecture and UX precedent

5. The Admin Dashboard has no raw Invite Key list/browse surface (AD-10's aggregate-only posture, and `EXPERIENCE.md`'s Admin Dashboard row names only "Metrics + Mint Key" — no key browser is in scope). "Selects an unredeemed Invite Key" (AC1) is satisfied by Tony typing/pasting the specific code he already has (he minted it, or someone reported it to him) and looking it up — not by browsing a table of every key ever minted.
6. The lookup reuses the **existing** `checkInviteKey` query verbatim (no new query, no schema change for lookup) to show Tony the key's current status before he can act, so AC2's "the action is unavailable" is literal: the Revoke control only renders when the looked-up status is `unredeemed`. A `redeemed` or already-`revoked` key is displayed with a specific, non-actionable message instead of a disabled/hidden button appearing out of nowhere.
7. Revocation itself is new: a dedicated `invite-key-revoke` Lambda behind a new `revokeInviteKey(code: String!): Boolean` mutation, gated by `allow.group('Admin')` (AD-9) — the server is the actual enforcement boundary for AC4; the UI lookup in clarification 6 is presentation, not security.
8. The revoke write is a single atomic conditional `UpdateItem` — `ConditionExpression: #status = :unredeemed`, `SET #status = :revoked, updatedAt = :timestamp` — the same technique Story 1.1/AD-16 already uses for redemption, applied to a different transition. It is never a read-then-write.
9. A race between the client-side lookup and the actual revoke (someone redeems the key in between, or a second admin tab revokes it first) is handled server-side, not assumed away: on a conditional-check failure, the Lambda performs one additional consistent `GetItem` to report *which* specific reason blocked it (not found / already redeemed / already revoked) via a stable error code — never a read-then-write race for the write itself, only for producing an accurate failure message after the atomic write already failed.
10. Revoking an already-revoked key is a safe no-op from the user's perspective: the UI's own lookup-gated Revoke button prevents this in the normal flow; if reached anyway (e.g., a stale second tab), the server rejects it the same way as any other non-`unredeemed` state, with its own specific message. No special-case code path is required beyond clarification 9's three-way message.
11. No confirmation dialog, no undo/un-revoke action, and no audit/history log — matches the Admin Dashboard's established "ugly but functional," no-extra-polish posture (Story 4.3 excluded the equivalent for Config edits).

## Pre-dev prerequisites (Tony, before the dev agent starts)

1. No new secret, provider account, model access, or third-party setup is required.
2. Use the repository's established Node 24.9.0 runtime.
3. Start with a valid AWS session and reachable Amplify sandbox for deploy/live verification. Tony's existing `Admin` group membership is the positive authorization identity; the shared `TAROT_E2E_*` account must remain non-admin.
4. Have at least one real `unredeemed` Invite Key code available in the sandbox for live verification (mint one via the existing "Mint Key" control if none is already on hand) — this story's own live walkthrough needs a disposable key to revoke.

## Contract values (frozen — implement exactly these)

| Item | Contract |
|---|---|
| New Lambda | `amplify/functions/invite-key-revoke/` (`resource.ts` + `handler.ts`), `resourceGroupName: 'data'` (same-stack as the `InviteKey` table — avoids the cross-stack circular-dependency hazard documented in `amplify/backend.ts` for the auth/data split). Named for the one responsibility it owns, per the project's "thin Lambda capability boundary" rule — not folded into `invite-key-mint`, which owns a different write shape (`Put`/`TransactWrite`) and a different caller contract. |
| GraphQL mutation | `revokeInviteKey(code: String!): Boolean`, `authorization: [allow.group('Admin')]`, `handler: a.handler.function(inviteKeyRevoke)`. Returns `true` on success; throws on every rejection path. |
| IAM grant | `inviteKeyTable.grant(inviteKeyRevokeLambda, 'dynamodb:GetItem', 'dynamodb:UpdateItem')` only — no `PutItem`, `DeleteItem`, `Scan`, or broad `grantWriteData`. Least-privilege, matching the pattern already used for `orientationGuideLambda`'s scoped `sessionTable.grant(...)` in `amplify/backend.ts`. |
| Conditional write | `UpdateCommand` (or raw `UpdateItemCommand` via the Document client, matching `invite-key-mint`'s style) on `Key: { id: code }`, `ConditionExpression: '#status = :unredeemed'`, `UpdateExpression: 'SET #status = :revoked, updatedAt = :timestamp'`, `ExpressionAttributeNames: { '#status': 'status' }`, `ExpressionAttributeValues: { ':unredeemed': 'unredeemed', ':revoked': 'revoked', ':timestamp': <ISO-8601 now> }`. |
| Failure classification | On `ConditionalCheckFailedException` (direct `UpdateCommand`, not a transaction, so this is the plain SDK exception type — not `TransactionCanceledException`), issue one consistent `GetCommand` (`ProjectionExpression: '#status'`, same as `check-invite-key/handler.ts`) and throw exactly one of: `'INVITE_KEY_NOT_FOUND'` (no `Item`), `'INVITE_KEY_ALREADY_REDEEMED'` (`status === 'redeemed'`), `'INVITE_KEY_ALREADY_REVOKED'` (`status === 'revoked'`). Any other unexpected stored value throws a generic `'INVITE_KEY_REVOKE_FAILED'`. These are the "stable backend error codes" the project convention requires crossing the client boundary as-is (thrown as `Error(code)`), with prose mapping happening only in the frontend component — never invent new prose at the Lambda layer. |
| Blank/invalid input | Trim `event.arguments.code`; if empty after trim, throw `'INVITE_KEY_NOT_FOUND'` without any DynamoDB call (parity with `check-invite-key/handler.ts`'s blank-code short-circuit, reusing the same code rather than inventing a fourth one for an input shape AppSync's own `required()` already discourages). |
| Missing table config | If `INVITE_KEY_TABLE_NAME` is unset, throw a clear internal error (`'invite-key-revoke table configuration is missing'`) before any DynamoDB call — mirrors `invite-key-mint/handler.ts`'s existing guard. |
| Client utility | `src/utils/inviteKeys.js`: add named export `revokeInviteKey(code)` using the **default** (`userPool`) `generateClient()` — this is an Admin-only authenticated mutation, unlike `checkInviteKey`'s deliberate `apiKey` client. Call `client.mutations.revokeInviteKey({ code })`; inspect `errors` (Amplify Data returns mutation failures there, not as thrown exceptions) and `throw new Error(errors[0].message)` so the stable code above survives unchanged to the caller; throw a clear error if `data` is falsy. Return the boolean. |
| Lookup reuse | `RevokeInviteKey.jsx` imports the **existing** `checkInviteKey` from `../utils/inviteKeys` (unchanged, still `apiKey` auth mode) for its "Check key" step — do not duplicate or reimplement that query. Using an `apiKey`-mode client call from within an already-`userPool`-authenticated page is intentional and already how this codebase's auth modes compose; it adds no new backend surface. |
| New component | `src/components/RevokeInviteKey.jsx`. Props: `checkInviteKeyFn = checkInviteKey`, `revokeInviteKeyFn = revokeInviteKey`, both injectable for tests (matches `SignUp.jsx`/`MintInviteKey.jsx` convention). Admin-dashboard visual language only (plain labeled `<input>` + buttons styled like `AdminConfigEditor.jsx`'s `inputClass`/button classes) — do **not** reuse the public-facing `Field.jsx` component, which belongs to SignUp/LogIn's different visual treatment. |
| Exact copy | Label: **"Invite Key code"**. Lookup button: **"Check key"** (disabled while the trimmed input is empty or while busy). Lookup results, each its own `role="status"` text: unredeemed → **"This key is unredeemed — ready to revoke."**; redeemed → **"This key has already been redeemed — it can't be revoked."**; already revoked → **"This key has already been revoked."**; not found (`null`) → **"No Invite Key found with that code."**. Revoke button (only rendered after a lookup whose result is `unredeemed`): **"Revoke key"**. Revoke success: `role="status"` **"Invite Key revoked."**, and the displayed lookup status flips to the already-revoked text above (so the Revoke button disappears — no double-revoke affordance). Revoke failure maps the stable code to the matching message above; an unrecognized code or network failure uses **"Couldn't revoke this key. Please try again."** (`role="alert"`). Blank-code "Check key" attempt: inline `role="alert"` **"Enter an Invite Key code first."**, no network call. |
| Guards | Synchronous `useRef` duplicate-submit guard for both "Check key" and "Revoke key" (mirrors `MintInviteKey.jsx`/`AdminConfigEditor.jsx`), an unmount-safe `mounted` ref before every post-await `setState` (mirrors `AdminConfigEditor.jsx`), and both buttons disabled while their respective action is in flight. |
| Dashboard composition | `AdminDashboard.jsx`: render `<RevokeInviteKey />` in the existing ready/admin branch, near `MintInviteKey` — no new App-level state, no change to the loading/error/ready state machine, Back, Retry, or any existing metric. |
| No rate limiting | `revokeInviteKey` is Admin-group-gated and low-frequency (single operator), like `adminMintInviteKey` and the `Config` update mutation before it — no new WAF rule. Do not add one. |

## Explicitly out of scope (do not build)

- Any Invite Key list/browse/table view on the Admin Dashboard (AD-10's aggregate-only posture; clarification 5 above).
- Folding this capability into `invite-key-mint`'s Lambda via another `fieldName` branch, or adding a shared service/repository layer between the two.
- An un-revoke/restore action, confirmation dialog, or audit/history log (clarification 11).
- Any change to `amplify/auth/post-confirmation/handler.ts`, `src/components/SignUp.jsx`, or the `checkInviteKey` Lambda itself — the "This key was revoked" path is already fully built and already correct; this story only needs to make a key reach that state via an admin action.
- Any change to `App.jsx`, `adminAuth.js`, `AdminConfigEditor.jsx`, `MintInviteKey.jsx`, Cognito groups, Session/Orientation Guide lifecycle, or Config.
- Rate limiting, new charts, ornamental dividers, or a separate mobile layout.
- A permanent paid-generation Playwright/CI scenario (not applicable to this story anyway — no LLM call is involved).

## Tasks / Subtasks

- [x] **Task 0: Environment pre-flight** (gate)
  - [x] Confirm `git log -1 --oneline` starts at `893c9ed` (or document a later reviewed baseline) and preserve any unrelated dirty-worktree changes.
  - [x] Use Node 24.9.0. Run baseline `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; record actual counts.
  - [x] Verify AWS/sandbox access, Tony's `Admin` membership, the shared test account's non-admin status, and that at least one `unredeemed` Invite Key code is available for later live revoke verification (mint one via the existing dashboard "Mint Key" control if needed).

- [x] **Task 1: Build the revoke Lambda** (AC: 1, 3; clarifications 7–10)
  - [x] New `amplify/functions/invite-key-revoke/resource.ts` (`defineFunction`, `name: 'invite-key-revoke'`, `resourceGroupName: 'data'`).
  - [x] New `amplify/functions/invite-key-revoke/handler.ts`: injectable-dependency `createHandler(deps)` factory (mirror `invite-key-mint/handler.ts`'s shape — `dynamo`, `inviteKeyTableName`, no `generateCode` needed here). Trim `event.arguments.code`; blank → throw `'INVITE_KEY_NOT_FOUND'` with zero DynamoDB calls. Missing table name → throw the clear config-missing error with zero calls. Otherwise issue the frozen conditional `UpdateCommand`; on success return `true`. On `ConditionalCheckFailedException`, issue the follow-up consistent `GetCommand` and throw the matching stable code per the frozen classification table; an unexpected stored status throws `'INVITE_KEY_REVOKE_FAILED'`. Any other DynamoDB error propagates unchanged (no swallowing).
  - [x] New `amplify/functions/invite-key-revoke/handler.test.ts`: assert the exact `UpdateCommand` input (key, condition, update expression, attribute names/values, ISO timestamp shape) for the success path; assert each of the three classified failure codes by mocking the conditional failure then the follow-up `GetCommand` response; assert the generic code for an unrecognized stored status; assert blank-code and missing-table-config paths make zero `dynamo.send` calls. Every new test must be mutation-survivable (prove it fails against a deliberately wrong condition/expression/code).

- [x] **Task 2: Wire the Admin-gated mutation into the schema** (AC: 1, 2, 4; clarifications 7, 9)
  - [x] `amplify/data/resource.ts`: import `inviteKeyRevoke` from the new function's resource file; add `revokeInviteKey` exactly per the frozen contract table (arguments, return type, `allow.group('Admin')` only — no `authenticated`, `publicApiKey`, or owner rule).
  - [x] Add a focused schema-contract assertion to `amplify/data/resource.test.ts` for the new `revokeInviteKey` operation block (reuse/extend the file's existing `extractModelBlock` helper, which already takes a `modelName`/operation name and a source string — it is not Config-specific) proving: Admin-group-only authorization, `code: a.string().required()` argument, and `a.boolean()` return type. This is a smaller sibling of the existing `Config` contract block in the same file, not a new testing pattern.
  - [x] Do not change any other model, operation, or authorization rule in this file.

- [x] **Task 3: Register and grant the function in the backend stack** (AC: 1, 4)
  - [x] `amplify/backend.ts`: import `inviteKeyRevoke`, add it to `defineBackend({...})`, obtain `inviteKeyRevokeLambda = backend.inviteKeyRevoke.resources.lambda`.
  - [x] `inviteKeyTable.grant(inviteKeyRevokeLambda, 'dynamodb:GetItem', 'dynamodb:UpdateItem')` — exactly these two actions, nothing broader.
  - [x] `backend.inviteKeyRevoke.addEnvironment('INVITE_KEY_TABLE_NAME', inviteKeyTable.tableName)`.
  - [x] Do not touch any other grant, environment variable, alarm, or stack wiring in this file.

- [x] **Task 4: Add the thin client utility** (AC: 1, 2, 4)
  - [x] `src/utils/inviteKeys.js`: add named export `revokeInviteKey(code)` per the frozen contract (default `userPool` `generateClient()`, inspect `errors`, throw on missing `data`, return the boolean).
  - [x] Extend `src/utils/inviteKeys.test.js` with focused tests: exact call shape (`client.mutations.revokeInviteKey({ code })`); success returns `true`; an `errors` array throws an `Error` whose message equals the server's stable code unchanged; missing/falsy `data` with no errors throws a clear error. Follow the file's existing mocking pattern for `checkInviteKey`/`adminMintInviteKey`.

- [x] **Task 5: Build the RevokeInviteKey component** (AC: 1, 2; clarifications 5, 6, 10, 11)
  - [x] New `src/components/RevokeInviteKey.jsx` per the frozen contract: controlled code input, "Check key" action calling `checkInviteKeyFn`, result-specific status text, "Revoke key" action rendered only when the last lookup result is `'unredeemed'`, calling `revokeInviteKeyFn`. Synchronous duplicate-submit guards for both actions, busy-disabled controls, unmount-safe state updates, exact copy from the contract table, `role="status"`/`role="alert"` per the frozen semantics.
  - [x] New `src/components/RevokeInviteKey.test.jsx`, mutation-survivable: blank-code "Check key" shows the inline error and makes zero calls; each of the four lookup outcomes (`unredeemed`, `redeemed`, `revoked`, `null`) renders its exact mapped text; the Revoke button is present only after an `unredeemed` lookup and absent for the other three; rapid double-click on either button makes exactly one call; a successful revoke announces success, flips the displayed status to "already revoked," and hides the Revoke button; each of the three classified revoke-failure codes renders its exact mapped message and leaves the key revocable again (Revoke button still present, since the lookup-side status hasn't changed — only a fresh "Check key" would reveal the new truth); an unrecognized/unmapped error renders the generic retry message; unmount during a pending Check/Revoke causes no stale `act()`-warning update.

- [x] **Task 6: Compose into the Admin Dashboard** (AC: 1, 2, 4)
  - [x] `AdminDashboard.jsx`: render `<RevokeInviteKey />` in the existing ready/admin branch near `MintInviteKey`. No other change to the component.
  - [x] Extend `AdminDashboard.test.jsx` with one integration assertion that `RevokeInviteKey` is composed and reachable in the ready state, alongside the existing Mint Key/Config editor assertions; keep exhaustive lookup/revoke behavior coverage in the component's own test file. Existing loading/error/ready, Back, Retry, Mint Key, Config editor, and all metrics assertions must keep passing unchanged.
  - [x] Confirm (via the existing `AppAuth`/authenticated E2E non-admin assertions, unchanged) that the whole dashboard — now including this new control — stays hidden from non-admin navigation; no new assertion needed here since the existing hidden-dashboard test already covers everything rendered inside it.

- [x] **Task 7: Live verification** (AC: all)
  - [x] Deploy with `npx ampx sandbox --once`.
  - [x] As Tony/admin: use "Check key" against the disposable `unredeemed` key from Task 0, confirm the unredeemed message and Revoke button appear, click "Revoke key," confirm the success announcement and that the status flips to already-revoked.
  - [x] Independently confirm via `aws dynamodb` (read-only `get-item`) that the same `InviteKey` item's `status` is now `revoked` and no second item was created.
  - [x] Attempt to redeem that now-revoked key through the real SignUp flow (or at minimum confirm `checkInviteKey` against it returns `'revoked'`, which SignUp.jsx already renders as "This key was revoked" — do not create a real throwaway Account unless Tony wants one for this check).
  - [x] As Tony/admin: "Check key" against an already-`redeemed` key (any real redeemed key, e.g. an existing Account's onward key) and confirm the redeemed message appears with no Revoke button; directly attempt the `revokeInviteKey` mutation against it (e.g. via the AppSync console) and confirm it's rejected with `INVITE_KEY_ALREADY_REDEEMED`.
  - [x] As the non-admin shared `TAROT_E2E_*` account: confirm no RevokeInviteKey UI is reachable (covered by the existing hidden-dashboard behavior) and directly attempt `revokeInviteKey` in the AppSync console; confirm AppSync rejects it as `Unauthorized`, matching AC4.
  - [x] Attempt `revokeInviteKey` against a nonexistent code as admin; confirm `INVITE_KEY_NOT_FOUND`.

- [ ] **Task 8: Close out (Definition of Done)**
  - [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` with existing specs.
  - [ ] Review changed-file inventory; sweep code, tests, logs, and this story for credentials, real Invite Key codes, or personal Context/Guide content (redact any live-minted/revoked code used during verification, per the Epic 1 close-out precedent in `deferred-work.md`).
  - [ ] Update sprint status to `review` only when implementation and verification are complete.
  - [ ] Commit and push. Paste actual empty `git status --short` output and `git log -1 --oneline --decorate` in the Dev Agent Record; prose-only "committed and pushed" is insufficient (open action item from the Epic 3 retrospective).

## Dev Notes

### Scope decisions (made at story creation — flag disagreement instead of silently deviating)

1. **A dedicated new Lambda, not a third `fieldName` branch on `invite-key-mint`.** Mint's two existing branches (`mintOnwardKey`, `adminMintInviteKey`) share one write shape (`Put` a new item) and one underlying capability (create a key). Revoke is a structurally different write (conditional `Update` on an existing item) and a different capability. The project's own "thin Lambda capability boundary, no shared service layer" rule argues for a new, single-purpose function over multiplexing a third unrelated branch into mint's handler.
2. **The Admin Dashboard gets a "paste a code, look it up, then act" flow — not a key list.** AD-10 keeps the dashboard aggregate-only; `EXPERIENCE.md`'s Admin Dashboard row explicitly names only metrics + Mint Key. Building a list/browse view would be new scope AD-10 doesn't authorize and the epics/UX docs never asked for. The lookup-then-act flow still satisfies AC1's "selects an unredeemed Invite Key" and AC2's "the action is unavailable" literally, by reusing a query that already exists.
3. **Reusing `checkInviteKey` for the admin-side lookup, called from an authenticated page via its existing `apiKey` auth mode.** This avoids adding any new query, schema change, or IAM surface purely for "show Tony the status before he commits." If Tony would rather the lookup go through a `userPool`/Admin-gated path instead (e.g., for audit-trail reasons), flag it — as specified, this reuses existing, already-shipped, already-tested capability unchanged.
4. **Three distinct server-side failure codes, surfaced through the frontend's own mapping — not through the Lambda inventing user-facing prose.** Matches the project rule that stable backend error codes cross the boundary and internal detail does not, and matches this codebase's established pattern (`checkInviteKey`'s status string + `SignUp.jsx`'s `KEY_ERRORS` map) of mapping codes to copy at the UI layer, not the backend.
5. **No confirmation dialog and no un-revoke.** Matches Story 4.3's equivalent exclusions for Config edits and this release's deliberate "ugly but functional," low-investment Admin Dashboard posture per `EXPERIENCE.md`.

### Current UPDATE files — read before editing

- `amplify/data/resource.ts`
  - **Today:** `InviteKey` model already has `status: a.enum(['unredeemed', 'redeemed', 'revoked'])` and `.authorization((allow) => [allow.authenticated().to([])])` — i.e., no browser CRUD at all; all current access is either direct IAM (post-confirmation trigger, mint Lambda) or the explicit `checkInviteKey` query.
  - **Change:** add the new `revokeInviteKey` mutation only. Do not touch the `InviteKey` model block itself — it already has everything this story needs (the `revoked` enum value already exists).
  - **Preserve:** every other model, operation, and authorization rule exactly as-is.
- `amplify/backend.ts`
  - **Today:** registers `checkInviteKey` and `inviteKeyMint` in the `data` resource group, with `inviteKeyTable.grantWriteData(inviteKeyMintLambda)` (broad) and `inviteKeyTable.grantReadData(checkInviteKeyLambda)` (read-only) as the two existing access patterns on this table.
  - **Change:** register `inviteKeyRevoke`, with its own narrowly-scoped `grant(..., 'dynamodb:GetItem', 'dynamodb:UpdateItem')` — deliberately narrower than mint's `grantWriteData`, since revoke never creates or deletes items.
  - **Preserve:** every existing grant, environment variable, alarm, DLQ, and the documented auth/data circular-dependency workaround (SSM parameter pattern) — none of that is touched by this story.
- `src/utils/inviteKeys.js`
  - **Today:** exports `checkInviteKey` (apiKey client), `mintOnwardKey` and `adminMintInviteKey` (both default/userPool client).
  - **Change:** add `revokeInviteKey` (userPool client, parallel to the mint functions' shape).
  - **Preserve:** the other three exports unchanged.
- `src/components/AdminDashboard.jsx`
  - **Today:** ready-state branch renders `<MintInviteKey />` then `<AdminConfigEditor ... />` then the metrics `<dl>`.
  - **Change:** add `<RevokeInviteKey />` alongside them (position: near `MintInviteKey`, since both operate on Invite Keys).
  - **Preserve:** the three-state machine (`loading`/`error`/`ready`), Back/Retry, and every existing metric.

### Architecture compliance

- **AD-9:** server-side enforcement is the new mutation's `allow.group('Admin')` rule; UI hiding (the whole dashboard, same as every prior Epic 4 story) is presentation only, never the security boundary.
- **AD-10:** no raw Invite Key list/browse surface is introduced; the lookup is a single-code, already-existing, already-authorized query — not a new aggregate or cross-account read.
- **AD-16:** this story extends the same atomic-conditional-update technique AD-16 established for redemption, applied to a new transition (`unredeemed → revoked` instead of `unredeemed → redeemed`). It does not modify AD-16's own redemption path.
- **AD-17/AD-18:** untouched — no interaction with onward-key eligibility or the admin-metrics aggregate Lambda.

### Testing requirements

- Every new test must be mutation-survivable: demonstrate it fails against a deliberately wrong condition expression, authorization rule, status code, or UI behavior before counting it as coverage.
- Unit/component tests mock AWS/AppSync seams and assert observable contracts (exact DynamoDB command shape, exact rendered copy, exact call counts) — not implementation call counts alone.
- Preserve `role="status"` for lookup/success announcements and `role="alert"` for failures; do not repeatedly announce unchanged state.
- Live verification must prove: a real `unredeemed` key becomes `revoked` in the same DynamoDB item (no second row); a revoked key is then rejected at the real SignUp flow (or via `checkInviteKey`) with the existing "This key was revoked" copy, unchanged; a non-admin's direct mutation attempt is rejected with `Unauthorized`; an already-redeemed key's direct revoke attempt is rejected with the specific `INVITE_KEY_ALREADY_REDEEMED` code.

### Git intelligence

Recent relevant history:

- `893c9ed` — `docs: mark story 4.5 done`
- `0cea435` — `fix: close the same auth-session race in refreshAuth's getCurrentUser (story 4.5)`
- `53933cc` — `feat: let admin edit daily limit and monthly budget without a deploy (story 4.3)`
- `2568d40` — `fix: address story 4.3 code review findings (two rounds)`
- `7766851` — `feat: add admin invite key minting (story 4.2)`

Story 4.5 (just completed) fixed an unrelated admin-status-recheck race in `App.jsx`/`refreshAuth.js` surfaced during Story 4.3's live verification — not expected to interact with this story, but worth knowing the Admin Dashboard's auth-gating code was recently touched. Follow the proven vertical slice: Lambda + handler test → schema mutation + contract test → backend registration/grants → client utility + test → focused component + test → dashboard composition → live auth/data checks → full gates. `feat:` fits the implementation commit; review fixes may use `fix:`.

### Latest technical information (verified 2026-10-02)

- Installed versions remain the project source of truth: `@aws-amplify/backend ^1.23.0`, `aws-amplify ^6.18.0`, `@aws-sdk/client-dynamodb`/`@aws-sdk/lib-dynamodb ^3.1085.0`, React `^19.2.0`, Vite `^7.3.1`, Vitest `^3.2.7`, Playwright `^1.61.1`. Do not upgrade dependencies for this story.
- The Document client's plain `UpdateCommand` (not a transaction) throws `ConditionalCheckFailedException` (from `@aws-sdk/client-dynamodb`) on a failed `ConditionExpression` — distinct from `invite-key-mint`'s `TransactWriteCommand` path, which throws `TransactionCanceledException` with a `CancellationReasons` array. Do not reuse `invite-key-mint`'s `isAccountConditionalFailure` helper shape; check `error instanceof ConditionalCheckFailedException` directly.
- Amplify Data mutation failures arrive in the client result's `errors` array, not as a thrown exception — already established by every existing utility in `src/utils/inviteKeys.js` and `src/utils/adminConfig.js`.

### Project Structure Notes

New files:

- `amplify/functions/invite-key-revoke/resource.ts`
- `amplify/functions/invite-key-revoke/handler.ts`
- `amplify/functions/invite-key-revoke/handler.test.ts`
- `src/components/RevokeInviteKey.jsx`
- `src/components/RevokeInviteKey.test.jsx`

Modified files:

- `amplify/data/resource.ts`
- `amplify/data/resource.test.ts`
- `amplify/backend.ts`
- `src/utils/inviteKeys.js`
- `src/utils/inviteKeys.test.js`
- `src/components/AdminDashboard.jsx`
- `src/components/AdminDashboard.test.jsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-4-revoke-an-invite-key.md`

Expected no-change files:

- `amplify/auth/post-confirmation/handler.ts`, `src/components/SignUp.jsx`, `amplify/functions/check-invite-key/**` (the revoked-key rejection path is already complete and correct)
- `amplify/functions/invite-key-mint/**`, `src/components/MintInviteKey*`
- `amplify/config.ts`, `src/components/AdminConfigEditor*`
- `src/App.jsx`, `src/utils/adminAuth.js`, `amplify/auth/resource.ts`
- `amplify/functions/start-orientation-guide/**`, `amplify/functions/orientation-guide/**`, Session/Config/Orientation Guide models and tests
- `e2e/**` (existing specs only)
- `package.json` / lockfile

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.4`] — story and four canonical ACs; "No PRD FR number" note.
- [Source: `_bmad-output/planning-artifacts/epics.md#Story-1.1`] — "This key was revoked" rejection copy and AD-16 atomicity, already built and unchanged by this story.
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md#AD-9`, `#AD-10`, `#AD-16`, `#AD-17`, `#AD-18`] — admin-group authorization, aggregate-only dashboard, redemption atomicity (the pattern this story extends), onward-key/metrics boundaries (unaffected).
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-tarot-spa-2026-07-09/EXPERIENCE.md#Component-Patterns`, `#Voice-and-Tone`] — Admin Dashboard's plain/no-polish posture; specific-over-generic error copy precedent (Invite Key rejection row); "Admin data possibly stale" and "Key minting fails" state-pattern precedents for this story's own status/error treatment.
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md#2026-07-16`] — prior manual precedent: an unredeemed key was flipped to `revoked` via a conditional DynamoDB update during Epic 1 close-out; same technique this story now builds as a real admin feature. Also the credential-redaction precedent this story's own close-out must follow for any live-verification key codes.
- [Source: `_bmad-output/implementation-artifacts/epic-3-retro-2026-07-26.md#Epic-4-Preparation-Tasks`] — names Story 4.4 ("revoking keys") as the fourth planned Epic 4 story.
- [Source: `_bmad-output/implementation-artifacts/4-3-adjust-the-daily-limit-and-monthly-budget-without-a-deploy.md`] — immediate predecessor pattern: thin utility + injectable focused component + one dashboard integration assertion + mutation-survivable testing bar + real Git-evidence close-out requirement (open action item, still enforced here).
- [Source: `amplify/data/resource.ts:33-44`] — current `InviteKey` model, its pre-existing `revoked` enum value, and its current no-browser-CRUD authorization.
- [Source: `amplify/functions/invite-key-mint/handler.ts`] — existing conditional-write and dependency-injection style this story's handler mirrors (with a plain `UpdateCommand` instead of a `TransactWriteCommand`).
- [Source: `amplify/functions/check-invite-key/handler.ts`] — existing status-lookup shape (`GetCommand`, `ProjectionExpression: '#status'`, `ConsistentRead: true`) this story's lookup reuses unchanged and whose follow-up-read shape the new Lambda's failure-classification step mirrors.
- [Source: `src/components/SignUp.jsx:6-9`] — existing `KEY_ERRORS` map, the direct precedent for this story's own code-to-copy mapping convention.
- [Source: `src/components/AdminConfigEditor.jsx`] — existing admin-input visual/behavioral conventions (`inputClass`, busy/disabled/unmount-safe/`aria-invalid` pattern) this story's new component follows.
- [AWS Amplify: Customize authorization rules](https://docs.amplify.aws/react/build-a-backend/data/customize-authz/)
- [AWS SDK for JavaScript v3: `ConditionalCheckFailedException`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the bmad-dev-story workflow.

### Debug Log References

- Baseline gate (before any change): `npm test` 365/365 passed (32 files), `npm run lint` clean, `npm run typecheck` clean, `npm run build` succeeded.
- Final gate (after implementation): `npm test` 396/396 passed (34 files), `npm run lint` clean, `npm run typecheck` clean, `npm run build` succeeded, `npm run test:e2e` 2/2 passed (unauthenticated project only — no `TAROT_E2E_*` credentials were present in this session's environment, so the authenticated Playwright project did not run, matching the documented conditional-project behavior in `playwright.config.js`).
- Git evidence (committed and pushed):

  ```
  $ git status --short
  (empty)

  $ git log -1 --oneline --decorate
  a369332 (HEAD -> main, origin/main, origin/HEAD) feat: let admin revoke an unredeemed invite key (story 4.4)
  ```
- Sandbox deploy: `npx ampx sandbox --once` completed in ~253s; created `invite-key-revoke` Lambda, its IAM role/policy (`GetItem`/`UpdateItem` only), the AppSync Lambda data source, and the `revokeInviteKey` resolver.
- Live verification evidence (disposable/pre-existing sandbox test keys only, not real codes — redacted here per the Epic 1 close-out credential-redaction precedent):
  - Direct `aws lambda invoke` against the real deployed `invite-key-revoke` function, against a real `unredeemed` sandbox test key → returned `true`; confirmed via `aws dynamodb get-item` that the *same* item (`createdAt` unchanged) flipped to `status: "revoked"` with a refreshed `updatedAt`, and no second row was created.
  - Direct `aws lambda invoke` against that now-revoked key → `INVITE_KEY_ALREADY_REVOKED`. Against a real pre-existing `redeemed` test key → `INVITE_KEY_ALREADY_REDEEMED` (and confirmed via a follow-up `get-item` that its status was untouched). Against a nonexistent code → `INVITE_KEY_NOT_FOUND`.
  - `curl` against the real, unchanged `checkInviteKey` public query for the now-revoked key → returned `"revoked"`, confirming `SignUp.jsx`'s existing "This key was revoked" path is unaffected and correct (AC3).
  - `curl` against the real `revokeInviteKey` mutation using the public API key (not a valid auth mode for this Admin-group-gated mutation) → rejected with AppSync `"Not Authorized to access revokeInviteKey on type Mutation"`; with no auth header at all → `UnauthorizedException`. A follow-up `get-item` confirmed the targeted key was untouched by either rejected attempt.
  - Tony then completed the two checks that require a real Cognito sign-in (no test credentials were available to the agent in this session): as himself/admin on `npm run dev`, used "Check key" → "Revoke key" against a disposable unredeemed key (confirmed the unredeemed message, Revoke button, success announcement, and flip to "already revoked"), and "Check key" against an already-redeemed key (confirmed the redeemed message with no Revoke button); and confirmed as the non-admin `TAROT_E2E_*` account that no Admin Dashboard entry point exists at all.
- **Bug found and fixed during live verification**: Tony's first live attempt hung forever on "Checking…". Root cause (confirmed with an isolated StrictMode probe test, not committed): React 18 StrictMode (`src/main.jsx` wraps `<App />` in `<StrictMode>`) double-invokes effects on mount in development — setup → cleanup → setup again. The `mounted` ref pattern specified in this story's own contract ("mirrors `AdminConfigEditor.jsx`") initializes `useRef(true)` and only ever sets it `false` in the cleanup, never back to `true` in the setup. Under StrictMode's dev-only double-invoke, that leaves `mounted.current` permanently `false` from the moment the component mounts — every post-await `if (!mounted.current) return;` guard then bails before `setBusy(false)` runs, hanging the busy state forever. This does not affect production builds (StrictMode's double-invoke is dev-only) and is invisible to the component's own unit tests (React Testing Library doesn't wrap renders in `StrictMode`), which is why none of this story's own tests caught it. Fixed in `RevokeInviteKey.jsx` by moving the `mounted.current = true` assignment into the effect's setup body (not just the ref initializer), verified empirically to survive the double-invoke correctly, then reverified live.
  - **Flagged, not fixed**: `AdminConfigEditor.jsx` has the identical latent defect (same `useRef(true)` + cleanup-only pattern) and is explicitly out of scope for this story ("Explicitly out of scope... Any change to... `AdminConfigEditor.jsx`"). Its Save flow likely hangs the same way in `npm run dev` under StrictMode. Recommend a small dedicated follow-up fix.
- Design clarification (not a deviation from any AC, but worth recording): the contract table says the "Check key" button is "disabled while the trimmed input is empty or while busy." A disabled native `<button>` never fires its `onClick` in any browser (confirmed empirically), so literally disabling it for blank input would make the required blank-code inline-alert path (an explicit Task 5 test) unreachable by a real click. Implemented as disabled only while an action is in flight (matching `AdminConfigEditor.jsx`'s/`MintInviteKey.jsx`'s own established convention of validating inside the handler rather than disabling for invalid input), with the blank-code case surfaced via the handler's own guard instead.

### Completion Notes List

- Built the `invite-key-revoke` Lambda (dependency-injected `createHandler(deps)`, mirroring `invite-key-mint`), the Admin-gated `revokeInviteKey` mutation, backend registration with least-privilege `GetItem`/`UpdateItem` grants, the thin `revokeInviteKey` client utility, the `RevokeInviteKey` component (lookup-then-act flow reusing the existing `checkInviteKey` query unchanged), and its Admin Dashboard composition — all per the story's frozen contract table.
- All four ACs satisfied: an unredeemed key can be revoked and is then permanently un-redeemable (AC1/AC3, live-verified); the Revoke action is only ever offered after an `unredeemed` lookup (AC2, both unit-tested and live-verified); the mutation is rejected server-side for any non-Admin caller via `allow.group('Admin')`, independent of the UI (AC4, live-verified against the public API key and no-auth, plus the existing non-admin hidden-dashboard coverage, plus Tony's own non-admin account check).
- 396/396 unit tests pass (31 new: 9 Lambda handler, 3 schema contract, 3 client utility, 16 component, 1 dashboard integration — plus 5 pre-existing `inviteKeys.test.js`/`AdminDashboard.test.jsx` tests unchanged), lint/typecheck/build all clean, e2e unauthenticated specs pass.
- A real StrictMode-only bug was found and fixed during live verification (see Debug Log References) — the component now behaves correctly in both `npm run dev` and production builds.

### File List

New:
- `amplify/functions/invite-key-revoke/resource.ts`
- `amplify/functions/invite-key-revoke/handler.ts`
- `amplify/functions/invite-key-revoke/handler.test.ts`
- `src/components/RevokeInviteKey.jsx`
- `src/components/RevokeInviteKey.test.jsx`

Modified:
- `amplify/data/resource.ts`
- `amplify/data/resource.test.ts`
- `amplify/backend.ts`
- `src/utils/inviteKeys.js`
- `src/utils/inviteKeys.test.js`
- `src/components/AdminDashboard.jsx`
- `src/components/AdminDashboard.test.jsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-4-revoke-an-invite-key.md`

## Change Log

- 2026-10-02: Story created via the BMad create-story workflow and set to `ready-for-dev`. Design freezes a dedicated `invite-key-revoke` Lambda behind a new Admin-gated `revokeInviteKey` mutation, reusing the existing `checkInviteKey` query unchanged for the Admin Dashboard's lookup-before-revoke UX so AC2's "action is unavailable" is literal without building any new key-list/browse surface. Flagged scope decisions 1–5 for Tony's review during story review rather than silently deciding them irreversibly.
- 2026-10-02: Implemented per the frozen contract — new `invite-key-revoke` Lambda, `revokeInviteKey` mutation (`allow.group('Admin')`), least-privilege backend grants, client utility, `RevokeInviteKey` component, and Admin Dashboard composition. All 8 tasks complete, 396/396 unit tests pass, lint/typecheck/build clean, e2e unauthenticated specs pass. Live-verified against the real sandbox (Lambda invoke + DynamoDB reads + public `checkInviteKey` + unauthorized AppSync rejection, plus Tony's own admin/non-admin UI click-through). Found and fixed a React 18 StrictMode-only bug during live verification: the `mounted`-ref pattern this story's own contract specified (mirroring `AdminConfigEditor.jsx`) left `mounted.current` permanently `false` in dev under StrictMode's double-invoke, hanging every post-await UI update; fixed in `RevokeInviteKey.jsx` only. Flagged (not fixed, out of scope) that `AdminConfigEditor.jsx` carries the identical latent defect. Status set to `review`.
- 2026-10-02: Post-review polish (Tony's own feedback after live-checking the pushed build): the section had no visible heading, only an `aria-label` (matching the dashboard's existing no-visible-heading convention, but Tony wanted this one clearly marked). Added a visible `<h2>Revoke Invite Key</h2>`, wired via `aria-labelledby` instead of the prior `aria-label`. 397/397 unit tests pass (1 new), lint/typecheck/build clean. Tony confirmed live.
