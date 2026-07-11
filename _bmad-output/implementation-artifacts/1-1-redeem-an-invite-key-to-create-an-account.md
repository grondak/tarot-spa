# Story 1.1: Redeem an Invite Key to create an Account

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a friend holding a valid Invite Key,
I want to enter my key and create an account,
so that I can start using tarot-spa.

This is Epic 1's first story and the project's first backend story ever — it stands up the entire Amplify Gen 2 backend (Cognito, Data, the post-confirmation function) as its technical foundation. Nothing backend-related exists before this story; everything after it builds on what this story creates.

## Acceptance Criteria

1. **Given** a visitor holds a valid, unredeemed Invite Key, **when** they enter the key and complete Cognito signup, **then** an Account is created with the `generation` inherited from the key, and the key's status flips to `redeemed`.
2. **Given** a visitor enters an invalid Invite Key, **when** they attempt signup, **then** they see "This key isn't valid" and no Account is created.
3. **Given** a visitor enters an already-redeemed Invite Key, **when** they attempt signup, **then** they see "This key's already been used" and no Account is created.
4. **Given** a visitor enters a revoked Invite Key, **when** they attempt signup, **then** they see "This key was revoked" and no Account is created.
5. **Given** two concurrent signup attempts using the same unredeemed key, **when** both submit at nearly the same time, **then** only one Account is created; the other is rejected as already-redeemed.
6. **Given** someone who already has an Account, **when** they attempt to redeem a second Invite Key under the same verified email, **then** the second signup is rejected.
7. **Given** this is the first new screen built for this release, **when** it renders on any viewport, **then** it uses `DESIGN.md`'s dark color tokens (no light mode/toggle), resizes fluidly across desktop and phone with no separate mobile layout, and every input/button carries an associated label and visible focus state.

[Source: epics.md#Story-1.1]

## Tasks / Subtasks

- [ ] **Task 1: Scaffold the Amplify Gen 2 backend** (AC: 1)
  - [ ] Install `aws-amplify@^6.18.0`, `@aws-amplify/backend@^1.23.0` (dependencies), `@aws-amplify/backend-cli@^1.8.3` (dev dependency). Amplify's CLI will pull in `aws-cdk-lib`/`constructs` peer deps automatically — don't hand-pin those versions.
  - [ ] Create `amplify/backend.ts` wiring auth + data + functions together (this is the root Amplify Gen 2 entry point — nothing else works without it)
  - [ ] Create `amplify/auth/resource.ts` — `defineAuth`, `loginWith: { email: true }` (this is what makes Cognito enforce email uniqueness per-pool — see Dev Notes, "Cognito already prevents AC6, don't build custom logic for it")
  - [ ] Create `amplify/data/resource.ts` — `defineData` with the `Account` and `InviteKey` models only (not Session/DailyUsage/MonthlySpend/Config — those belong to later stories that actually need them, per the project's own "create tables only when needed" rule)
- [ ] **Task 2: Define the Account and InviteKey data models** (AC: 1, 2, 3, 4)
  - [ ] `Account`: `generation` (enum: `FirstGen` | `SecondGen`), `onwardKeyGenerated` (boolean, default `false` — not used until Story 1.2, but the field belongs on the model now). Id is the Cognito `sub`, not a separately generated id.
  - [ ] `InviteKey`: `status` (enum: `unredeemed` | `redeemed` | `revoked`), `generation` (enum: `FirstGen` | `SecondGen` — what kind of Account this key creates), `redeemedBy` (nullable, Account id once redeemed). Seed at least one `unredeemed` `FirstGen` InviteKey manually (via Amplify sandbox console or a seed script) so there's something to test signup against — Story 4.2 (admin mint) doesn't exist yet.
  - [ ] Apply Amplify Data's owner-based authorization rule to `Account` (each record readable/writable only by its owning Cognito identity) — this is the model-level auth for `AC: 1`, distinct from anything the trigger does server-side.
- [ ] **Task 3: Build the pre-check query for fast invalid/redeemed/revoked feedback** (AC: 2, 3, 4)
  - [ ] Add a custom Amplify Data query (e.g. `checkInviteKey(code)`) that reads the `InviteKey` by its code and returns its `status` — this is a **non-atomic, UX-only pre-check** run *before* Cognito signup even starts, so a user with a bad key finds out immediately without going through email verification first.
  - [ ] This pre-check is not the enforcement mechanism — see Task 4. It exists purely so a user doesn't verify their email only to be told afterward that their key never worked.
- [ ] **Task 4: Build the post-confirmation trigger — this is the actual atomicity mechanism** (AC: 1, 4, 5, 6)
  - [ ] Create `amplify/auth/post-confirmation/resource.ts` (`defineFunction`) + `handler.ts`, wired into `amplify/auth/resource.ts` via `triggers: { postConfirmation }`
  - [ ] In `backend.ts`, grant this function's execution role access to the `InviteKey` and `Account` DynamoDB tables (`backend.data.resources.tables.InviteKey`, `.Account`) and to Cognito's `AdminDeleteUser` action on the user pool
  - [ ] Handler logic, in order:
    1. Read the Invite Key code from `event.request.clientMetadata.inviteKeyCode` — the frontend passes it as `clientMetadata: { inviteKeyCode }` in its `signUp()` call (Task 5). This is Cognito's standard mechanism for carrying custom data through to Lambda triggers; don't invent a custom attribute or a separate side-channel for this.
    2. Perform a single DynamoDB `TransactWriteItems` call with two items: (a) conditional `Update` on `InviteKey` — `ConditionExpression: status = unredeemed`, set `status = redeemed`, `redeemedBy = <new Account id>`; (b) `Put` on `Account` — id = the Cognito `sub` from the event, `generation` = the InviteKey's `generation`. Both succeed or both fail — this one transaction *is* AC 1 and AC 5.
    3. **If the transaction's condition check fails** (key already redeemed/revoked by a concurrent request): call Cognito's `AdminDeleteUser` on the user that was just confirmed. **Critical implementation detail:** a post-confirmation trigger cannot block or reverse the confirmation itself — confirmation has already happened by the time this trigger fires (AWS always requires the handler to return the event, or Cognito's whole auth flow breaks for that user). "Rejecting the signup" in practice means deleting the just-confirmed Cognito user as a compensating action immediately after, not preventing confirmation. Don't attempt to throw from the handler expecting Cognito to roll back confirmation on its own — it won't.
    4. Always `return event` at the end, success or failure path, per Cognito's trigger contract.
  - [ ] **AC 6 (same-identity multi-key redemption) needs no code in this handler at all.** Cognito enforces email uniqueness across the user pool automatically once `loginWith: { email: true }` is set (Task 1) — a second signup attempt with an already-registered email is rejected by Cognito itself, before this trigger ever fires. Confirm this is true in the sandbox rather than writing a redundant uniqueness check.
- [ ] **Task 5: Build the Sign Up / Redeem Invite Key screen** (AC: 2, 3, 4, 7)
  - [ ] **Do not use the prebuilt `@aws-amplify/ui-react` `<Authenticator>` component.** It doesn't have a concept of "Invite Key status" — that's this project's own business logic, not a Cognito auth state, and the Authenticator's built-in error messaging can't produce the three distinct AC 2/3/4 messages. Build a plain custom form calling `signUp()` from `aws-amplify/auth` directly.
  - [ ] Form fields: Invite Key code, email, password. On submit: call the Task 3 pre-check first; if invalid/redeemed/revoked, show the matching AC 2/3/4 message inline and stop — don't call Cognito `signUp()` at all in that case. If the pre-check passes, proceed to `signUp()` (passing `clientMetadata: { inviteKeyCode: <code> }` so the post-confirmation trigger can read it — see Task 4) + the confirmation-code step Cognito requires.
  - [ ] Copy exactly (per `EXPERIENCE.md`'s Voice and Tone table — these are specific, not generic "Invalid Invite Key" placeholders):
    - Invalid: "This key isn't valid"
    - Already redeemed: "This key's already been used"
    - Revoked: "This key was revoked"
  - [ ] Visual baseline (AC 7, first screen built this release): dark theme tokens from `DESIGN.md` (`surface`/`surface-container`/`outline`/`on-surface`/`primary`/`error`), the existing `Input` component treatment (`surface-container` background, `outline` border, `primary` border on focus), single fluid responsive layout (no separate mobile breakpoint set beyond the existing Tailwind scale), associated `<label>` on every field, visible focus rings.
- [ ] **Task 6: Wire authentication into `App.jsx`** (AC: 1)
  - [ ] `App.jsx` currently renders `SpreadSelector`/`SpreadView` unconditionally with no auth concept at all — that's the entire existing app. **Scope boundary for this story:** don't build Public Landing (Epic 2) or Context Entry (Epic 3) here. Add exactly one branch: unauthenticated → render the new Sign Up screen; authenticated → render the existing `SpreadSelector`/`SpreadView` flow completely unchanged, standing in as a temporary authenticated home until Story 3.1 replaces it with the real Context Entry screen.
  - [ ] No router library is being introduced in this story. The existing app has none (confirmed in `project-context.md`) and no Architecture Decision calls for adding one. Extend the same plain conditional-rendering style `App.jsx` already uses for `spreadKey ? <SpreadView> : <SpreadSelector>` — add one more level (auth state), don't introduce React Router or similar. If a real router becomes unavoidable later (Epic 2/3 adding more screens), that's a decision for whichever story first hits that wall, not this one.
  - [ ] Use `aws-amplify/auth`'s `getCurrentUser()` / `Hub` auth events to drive the authenticated/unauthenticated branch — a plain `useState` + effect is enough, consistent with the app's existing minimal-hooks style (only `useState` used anywhere today).
- [ ] **Task 7: Migrate the base path** (AC: none directly — infra prerequisite)
  - [ ] Update `vite.config.js`: `base: '/tarot-spa/'` → `base: '/'` (Architecture AD-2/AD-11 — GH Pages is being retired in favor of Amplify Hosting, which has no subpath convention). This is a one-line, low-risk change but do it in this story since it's the first one touching deploy-affecting config; don't leave it for a later story to trip over.
- [ ] **Task 8: Amplify environments** (AC: none directly — infra prerequisite)
  - [ ] Confirm the Amplify sandbox / `staging` branch environment (Architecture AD-11) provisions its own isolated Cognito pool + DynamoDB tables separate from `main` — verify by deploying to sandbox first and confirming signup works there before ever touching `main`.
- [ ] **Task 9: Tests**
  - [ ] Unit test the post-confirmation handler's transaction logic directly (mock the DynamoDB client) covering: happy path, condition-check failure → `AdminDeleteUser` called, and confirm `return event` happens on both paths
  - [ ] Component test for the Sign Up form's three distinct error states (mock the pre-check query to return each status)
  - [ ] No test framework is currently installed in this repo (`project-context.md` confirms greenfield territory here) — this story is where testing infrastructure gets introduced. Pick something standard for Vite + React (e.g. Vitest + React Testing Library) rather than inventing a bespoke setup; there's no existing convention to preserve or break.

## Dev Notes

- **The atomic mechanism is the whole point of this story.** AC 1/5/6 all hinge on the post-confirmation trigger's single `TransactWriteItems` call (Task 4). A naive read-then-write implementation (check InviteKey status, then separately update it) reopens the exact concurrent-double-redemption race this story exists to prevent — this was flagged explicitly by an earlier adversarial architecture review and is why the transaction must be one atomic call, not two.
- **Post-confirmation triggers can't block confirmation.** This is the single most likely place to get this story subtly wrong — see Task 4 step 3. Confirmation has already happened by the time the trigger fires; "rejecting" a bad redemption means deleting the just-confirmed Cognito user afterward (`AdminDeleteUser`), not preventing confirmation from completing.
- **Don't build a custom email-uniqueness check.** Cognito's own `loginWith: { email: true }` setting already makes email the unique identifier across the pool. AC 6 is satisfied by that one config line, confirmed via the search backing Architecture AD-16 — this is exactly the kind of "wheel reinvention" this workflow exists to prevent.
- **Don't use the prebuilt Amplify UI Authenticator component.** It has no concept of this project's InviteKey business logic and can't produce the three distinct rejection messages UX-DR9 requires. Build the form directly against `aws-amplify/auth`'s `signUp()` API.
- **No router library.** The existing app has zero routing (confirmed in `project-context.md`); this story extends the same conditional-render pattern `App.jsx` already uses, one level deeper (auth state). Don't introduce React Router or similar as a side effect of adding a second "screen."
- **Data model scope discipline:** only `Account` and `InviteKey` get created in this story. `Session`, `DailyUsage`, `MonthlySpend`, and `Config` belong to Story 3.2 and Story 4.3 — don't scaffold them early "while I'm in here."
- **Testing infrastructure starts here.** No test framework exists in the repo yet; this story is where it gets introduced (Vitest + React Testing Library is the standard, conventional pairing for Vite + React — no existing convention is being broken by picking it).
- **No secrets/env-vars to hand-wire.** `project-context.md` flags "no secrets exist anywhere in this repo" as new territory this story opens up — but Amplify Gen 2's own model handles this: the sandbox/deploy process generates `amplify_outputs.json` (Cognito pool id, AppSync endpoint, etc.) automatically, and the frontend just calls `Amplify.configure(outputs)` with it. Don't invent a manual `.env` scheme for these values — that's not how Amplify Gen 2 works, and it would fight the framework rather than use it. Do add `amplify_outputs.json` to `.gitignore` (it's environment-specific, regenerated per sandbox/branch deploy, not committed).

### Project Structure Notes

- New: `amplify/backend.ts`, `amplify/auth/resource.ts`, `amplify/auth/post-confirmation/{resource.ts,handler.ts}`, `amplify/data/resource.ts` — all new, per Architecture's Structural Seed source tree.
- New: a Sign Up screen component under `src/components/` (flat, one level deep, PascalCase filename — matches the existing `SpreadSelector.jsx`/`SpreadView.jsx`/`CardDisplay.jsx` convention exactly; don't create a subfolder for it).
- Updated (existing files, read before touching): `src/App.jsx` (currently: local `useState` for `spreadKey`/`cards`, handlers `handleSelect`/`handleDrawAgain`/`handleBack`/`handleLoadCode`, renders `SpreadView` or `SpreadSelector` unconditionally — no auth concept exists today. Preserve all of this unchanged for the authenticated branch; add only the auth-state branch described in Task 6), `vite.config.js` (one-line `base` change), `package.json` (new dependencies).
- Amplify's own backend-definition TypeScript (`amplify/**/*.ts`) is a separate concern from the frontend's plain-JS convention (Architecture AD-1) — don't let TypeScript leak into `src/`.

### References

- [Source: epics.md#Epic-1] — Epic goal, FR1/FR2 coverage, full Story 1.1 text
- [Source: ARCHITECTURE-SPINE.md#AD-3] — Amplify Gen 2 backend starter
- [Source: ARCHITECTURE-SPINE.md#AD-16] — Invite Key redemption atomicity (the core mechanism this story implements)
- [Source: ARCHITECTURE-SPINE.md#AD-8] — Account/InviteKey data model, composite key conventions
- [Source: ARCHITECTURE-SPINE.md#AD-9] — Owner-based authorization
- [Source: ARCHITECTURE-SPINE.md#AD-1] — Frontend stack stays as-is
- [Source: ARCHITECTURE-SPINE.md#AD-2, #AD-11] — Base path drops to `/`, Amplify Hosting environments
- [Source: ARCHITECTURE-SPINE.md Structural Seed] — source tree, Stack table (React 19.2.0, Vite 7.3.1, Tailwind 4.2.0, ESLint 9.39.1)
- [Source: EXPERIENCE.md#Information-Architecture] — Sign Up / Redeem Invite Key surface (spine-only, no mock)
- [Source: EXPERIENCE.md#Voice-and-Tone] — exact rejection copy per key status
- [Source: EXPERIENCE.md#State-Patterns] — "Invalid / already-redeemed / revoked Invite Key" and "Sign Up succeeds" rows
- [Source: DESIGN.md#Colors, #Components] — color tokens, Input component spec
- [Source: project-context.md] — existing frontend conventions (no router, no test framework, minimal hooks, flat component structure), hardcoded base path context
- Web-verified 2026-07-11: `aws-amplify` 6.18.0, `@aws-amplify/backend` 1.23.0, `@aws-amplify/backend-cli` 1.8.3 current latest (npmjs.com); post-confirmation trigger setup via `defineAuth`/`defineFunction` at `amplify/auth/post-confirmation/resource.ts`, must always return the event object (docs.amplify.aws/react/build-a-backend/auth/customize-auth-lifecycle/triggers); DynamoDB `TransactWriteItems` supports multi-item conditional writes across tables from a Lambda given table names via `backend.data.resources.tables.*` (docs.amplify.aws/react/build-a-backend/data/custom-business-logic); Cognito email-as-login enforces pool-wide email uniqueness by default (docs.amplify.aws/react/build-a-backend/auth/concepts/user-attributes, community confirmation at dev.to/andthensumm/enforcing-attribute-uniqueness-in-cognito-with-aws-amplify-and-react-263f).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
