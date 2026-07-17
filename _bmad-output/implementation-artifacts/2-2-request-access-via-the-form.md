# Story 2.2: Request access via the form

Status: review
baseline_commit: 40985965b13a1a492d59d16bbb1a3801549aa8bf

## Story

As a visitor who wants deeper access,
I want to submit my name and email requesting an Invite Key,
So that Tony can follow up and grant me one.

## Acceptance Criteria

1. **Given** a visitor fills in a valid name and email and submits, **when** the request is sent, **then** Tony's cutout address receives an email with the submitted name and email (via SES, AD-15), and the visitor sees a simple on-page acknowledgment
2. **Given** a visitor submits with an empty name, **when** they attempt to submit, **then** submission is blocked inline with a validation message and no email is sent
3. **Given** a visitor submits with a malformed email, **when** they attempt to submit, **then** submission is blocked inline with a validation message and no email is sent
4. **Given** a successful submission, **when** the visitor looks for a waitlist position or confirmation email, **then** none exists — the on-page acknowledgment is the only feedback (FR5 Out of Scope)

## Pre-dev prerequisites (Tony, before the dev agent starts)

Both are one-time setup; the dev agent cannot do them and Task 7 will stall without them (Task 6's gates need no sandbox — the stall point is the sandbox deploy and the live email check):

1. **SES identity verification** (Epic 1 retro action item #2): in the SES console (same region as the sandbox stack), create and verify an **email address identity** for the cutout address. ⚠️ SES sandbox mode requires **both sender and recipient** to be verified — this story sends *from* the cutout address *to* the cutout address precisely so that **one** verification covers both roles. Success = SES shows the identity as "Verified."
2. **Set the sandbox secret**: `npx ampx sandbox secret set CUTOUT_EMAIL` (enter the cutout address when prompted). Later, when `staging`/`main` branch environments exist (AD-11), the same secret gets set per-branch in the Amplify console — not this story's concern beyond noting it.

## Copy (exact strings — single source of truth for this story)

Section copy is quoted from the governing mockup (`mockups/public-landing.html`); validation/failure copy reuses Story 1.1's established phrasings where one exists. Use byte-for-byte; don't improvise alternates (EXPERIENCE.md Voice and Tone).

| Element | Copy |
|---|---|
| Section micro-label (`label-caps` treatment) | `Want the Deeper Experience?` |
| Section heading (`h2`) | `Request Access` |
| Section subtext | `Invite-only for now — leave your name and email and Tony will follow up personally.` |
| Field labels | `Name` / `Email` |
| Submit button | `Request Access` |
| Submit button, busy | `Please wait…` |
| Validation — empty/whitespace name | `Please enter your name.` |
| Validation — malformed email | `That email address doesn't look right — double-check it.` (same string SignUp already uses for `InvalidParameterException`) |
| Send failure (Lambda/network error) | `Couldn't send your request right now. Please try again.` |
| Success acknowledgment | `Request received — Tony will follow up personally.` |
| Email subject (fixed, server-side) | `tarot-spa access request` |

## Tasks / Subtasks

- [x] **Task 1: `request-access` Lambda** (AC: 1)
  - [x] `amplify/functions/request-access/resource.ts`: `export const requestAccess = defineFunction({ name: 'request-access', resourceGroupName: 'data', environment: { CUTOUT_EMAIL: secret('CUTOUT_EMAIL') } })` — `secret` imported from `@aws-amplify/backend`; the export name `requestAccess` is load-bearing (Task 2's import, Task 3's `defineBackend` shorthand and `backend.requestAccess` all depend on it — precedent: `export const checkInviteKey`). `resourceGroupName: 'data'` is required (same nested stack as `data`, same as `check-invite-key`/`invite-key-mint`) so the schema can reference the handler without a cross-stack cycle.
  - [x] `amplify/functions/request-access/handler.ts`, following **`invite-key-mint/handler.ts`'s testable shape** — typed event, `createHandler(deps: HandlerDependencies = defaultDependencies)`, `export const handler = createHandler()`, no abstraction layers per AD-4. Deps: `{ ses: CommandClient; cutoutEmail: string }`, defaults `new SESv2Client({})` / `process.env.CUTOUT_EMAIL ?? ''`. (Do NOT copy `check-invite-key`'s module-level-client shape — that variant can't be unit-tested without module mocks.)
    - Event type `{ arguments: { name: string; email: string } }`.
    - Server-side validation: the **same trim + regex as the client** (`name.trim()` non-empty; `email.trim()` matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), **plus server-only hardening the client doesn't need**: length-cap `name` at 200 chars and `email` at 320 (`slice`), and collapse CR/LF in `name` (`replace(/[\r\n]+/g, ' ')`) so a multi-line name can't forge extra `Email:`-style lines into the email body. On invalid → `throw new Error('invalid request-access submission')` (surfaces as a GraphQL error; UI can't normally reach this — it's defense against direct API calls).
    - Throw a clear config error if `deps.cutoutEmail` is empty.
    - Secret resolution, two levels:
      - **Primary:** `process.env.CUTOUT_EMAIL` — Amplify's function bundler resolves `secret()` values into the runtime env.
      - **Fallback, only if Task 7's live run shows an unresolved SSM placeholder instead of the address:** the documented typed import `import { env } from '$amplify/env/request-access'` (docs.amplify.aws → Functions → Environment variables and secrets). ⚠️ This import additionally requires adding `"paths": { "$amplify/*": [".amplify/generated/*"] }` to `tsconfig.json` — the root tsconfig has no such mapping today, so without it `npm run typecheck` fails.
    - Send via SES v2: `SendEmailCommand` with `FromEmailAddress: cutout`, `Destination: { ToAddresses: [cutout] }`, `Content: { Simple: { Subject: { Data: 'tarot-spa access request' }, Body: { Text: { Data: \`Name: ${name}\nEmail: ${email}\` } } } }`. Return `true`.
    - ⚠️ **Header-injection guard is structural, not sanitization:** user-supplied values appear ONLY in the plain-text body; the subject is a fixed literal; From/To are the trusted secret. Do not interpolate `name`/`email` into Subject or any address field.
  - [x] Add devDependency `@aws-sdk/client-sesv2` at `^3.1085.0` (same pinned family as the existing four `@aws-sdk/*` devDeps — keep them aligned).
- [x] **Task 2: Schema mutation** (AC: 1)
  - [x] `amplify/data/resource.ts`: add `requestAccess: a.mutation().arguments({ name: a.string().required(), email: a.string().required() }).returns(a.boolean()).authorization((allow) => [allow.publicApiKey()]).handler(a.handler.function(requestAccess))` — same public-apiKey pattern as `checkInviteKey` (the caller is unauthenticated by definition). Import the function from `../functions/request-access/resource`.
  - [x] ⚠️ This is now the **second** operation riding the 30-day apiKey mode — the deferred-work API-key-expiry decision (nominal expiry ~2026-08-11) now covers both `checkInviteKey` and `requestAccess`. Add a line to `deferred-work.md` noting the expanded blast radius; the decision itself stays an Epic-3-gate (Tony + Winston), not this story's.
- [x] **Task 3: Backend wiring** (AC: 1)
  - [x] `amplify/backend.ts`: import `requestAccess`, add to `defineBackend({...})`, grab `backend.requestAccess.resources.lambda`.
  - [x] SES IAM grant via `addToRolePolicy`: action `ses:SendEmail` (the SES v2 `SendEmail` API maps to this action), resource `dataStack.formatArn({ service: 'ses', resource: 'identity', resourceName: '*' })`. The wildcard identity is a plain-string pattern for the same reason as the existing User Pool wildcard (documented in backend.ts): the cutout address is a runtime secret, unknowable at synth as a plain string. Scope: single action, single Lambda — same accepted-residual-risk register as the existing comment; say so in a comment.
  - [x] No DynamoDB grants, no SSM parameters, no new environment plumbing — this Lambda touches no tables (FR5: no DB record). Don't cargo-cult the post-confirmation SSM machinery; `resourceGroupName: 'data'` makes direct wiring safe, and there's nothing to wire anyway.
  - [x] **WAF parity**: add a second rule (priority 1) to the existing `ApiRateLimit` `CfnWebACL` rules array — identical shape to `RateLimitPerIp` but `searchString: 'requestAccess'`, `metricName: 'tarotSpaRequestAccessRateLimit'`, name `RateLimitRequestAccessPerIp`, limit 100. Rationale: this is the second public unauthenticated operation, and this one triggers real email sends; it gets the same practical-minimum IP rate limit the first one already has. This is infrastructure parity with an existing precedent, NOT the product-level anti-abuse/dedup that FR5 explicitly excludes — do not add captchas, honeypots, dedup, or per-email throttling.
- [x] **Task 4: Frontend client util** (AC: 1)
  - [x] `src/utils/requestAccess.js` (named export, camelCase, mirroring `inviteKeys.js` exactly): `generateClient({ authMode: 'apiKey' })`, call `client.mutations.requestAccess({ name, email })`, throw `errors[0].message` if errors, throw if `!data`, return `true`.
- [x] **Task 5: `RequestAccess` form component + landing integration** (AC: 1, 2, 3, 4)
  - [x] `src/components/RequestAccess.jsx` — default export, plain JSX, flat under `src/components/`. DI seam per the established pattern: `requestAccessFn = requestAccess` prop (mirrors SignUp's `checkInviteKeyFn`).
  - [x] State: `name`, `email`, `error`, `busy`, `submitted` via `useState`, plus the `submittingRef` synchronous double-submit guard copied from SignUp (React batches `setBusy` — the ref closes the re-entry gap; keep SignUp's comment style).
  - [x] **Form uses `noValidate`** and explicit JS validation in the submit handler — this is what makes AC 2/3's "blocked inline with a validation message" deterministic and testable (native bubbles aren't assertable in RTL, and `Field` hardcodes `required`, which `noValidate` neutralizes). Order: trim both → empty name → name message; else email fails `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → email message; either way `return` before calling `requestAccessFn` (AC 2/3: "no email is sent"). One error line, `role="alert"`, `text-sm text-red-400` — SignUp's exact error treatment (DESIGN.md: `error` red-400 is for form/validation errors only).
  - [x] On valid: `setBusy(true)`, call `requestAccessFn(trimmedName, trimmedEmail)`; success → `setSubmitted(true)`; failure → the send-failure copy, form stays intact for retry. `finally` resets ref + busy.
  - [x] **Success state** (AC 1, 4): replace the form (inside the panel) with the acknowledgment copy in a visible `<p>`, AND announce it via the established live-region pattern — a persistent `<span role="status" aria-live="polite" className="sr-only">` that is mounted from first render and whose text becomes the acknowledgment on success (`GrantInviteKey.jsx`'s exact treatment; a `role="status"` element that *mounts with* its content is often not announced by screen readers). Nothing else — no waitlist position, no email-sent framing beyond the acknowledgment copy, no reset-and-submit-again affordance (FR5 is purely transactional).
  - [x] **Reuse `Field` verbatim** for Name (`type="text"`, `autoComplete="name"`) and Email (`type="email"`, `autoComplete="email"`). The mockup's uppercase field labels are illustrative — DESIGN.md's Input row ("unchanged text-input treatment") + `Field`'s existing label style win. Do NOT fork Field or hand-roll inputs. (`Field`'s auto-ids `name`/`email` collide with nothing on this screen.)
  - [x] Layout, matching the mockup's structure with the landing's established tokens: section `mx-auto max-w-3xl border-t border-gray-800 py-12` with the centered micro-label/`h2`/subtext header (same classes as the Quick Draw section header in `PublicLanding.jsx`); panel `mt-8 rounded-2xl border border-gray-800 bg-gray-900 p-6` (the `mt-8` separating panel from section header matches the Quick Draw panel); the two fields in a `flex flex-wrap gap-4` row, each wrapper `min-w-[200px] flex-1`; submit left-aligned below, primary treatment (full byte-exact string, SignUp's primary-button standard): `rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-wait disabled:opacity-60` — intentionally `px-6` and no `w-full` (the mockup's submit is left-aligned, not SignUp's full-width layout); don't "correct" it back to SignUp's `px-4 w-full`.
  - [x] `PublicLanding.jsx`: render `<RequestAccess />` as a new section **after** the Quick Draw section (mockup order), inside the existing `<main>`. No other landing changes; the `spreadKey` branch already swaps the whole landing (form included) for `SpreadView` — that's correct, leave it.
  - [x] **NO ornamental divider** (❦ stays exclusive to Context Entry / Orientation Guide Results), no new palette, no light mode. A11y floor: labels come from `Field`; focus-visible on the submit button; DOM order = reading order.
- [x] **Task 6: Tests** (AC: all)
  - [x] `amplify/functions/request-access/handler.test.ts` (new — same pattern as `invite-key-mint/handler.test.ts` and `post-confirmation/handler.test.ts`, which already run in the always-on Vitest gate: build the handler via `createHandler` with a mocked `ses` dep, assert on the commands it sends):
    - Empty/whitespace name, malformed email → throws, **no** `SendEmailCommand` sent (server side of AC 2/3)
    - Empty `cutoutEmail` dep → config error, no send
    - Happy path → exactly one `SendEmailCommand`; From/To both the cutout; Subject is the fixed literal; the trimmed name and email appear only in `Body.Text.Data`; returns `true`
    - Name containing `\r\n` → collapsed to a space in the body (the forged-`Email:`-line guard)
    - Oversized values → body contains `name` sliced to 200 chars / `email` to 320 (the caps can't silently regress)
  - [x] `src/components/RequestAccess.test.jsx` (new, established RTL style: DI props, label/role queries, `findBy*`/`waitFor` to settled states, `beforeEach` mock resets):
    - ⚠️ **Accessible-name collision trap:** `Request Access` is BOTH the section `h2` and the submit button on this screen. Always role-scope queries — `getByRole('heading', { name: 'Request Access' })` / `getByRole('button', { name: 'Request Access' })`; a bare `getByText('Request Access')` throws on multiple matches. Applies to the e2e additions too.
    - ⚠️ **Duplicate acknowledgment-string trap:** on success the ack copy exists TWICE in the DOM (visible `<p>` + the sr-only live region), and jsdom applies no CSS so it can't tell them apart — `getByText(...)` throws on multiple matches, and a `role="status"`-scoped query proves only the sr-only span. Assert `getAllByText('Request received — Tony will follow up personally.')` has length 2 (covers both), plus the form inputs gone.
    - Section copy renders: micro-label, `Request Access` heading, subtext; `Name`/`Email` inputs labeled (AC 1 surface)
    - Empty name → click submit → `Please enter your name.` visible, `requestAccessFn` **not called** (AC 2)
    - Whitespace-only name (`'   '`) → same (AC 2, trim)
    - Malformed email (`'not-an-email'`, and `'a@b'` — fails the dot requirement) → email message, fn not called (AC 3)
    - Valid `' Priya Shah '` / `' priya@example.com '` → fn called once with **trimmed** `('Priya Shah', 'priya@example.com')`; acknowledgment rendered (per the duplicate-string trap below: `getAllByText` length 2); form inputs gone (AC 1, 4)
    - fn rejects → send-failure message visible (`role="alert"`), inputs still present, second submit retries (fn called twice total)
    - While pending (unresolved promise) → button shows `Please wait…` and is disabled
  - [x] `src/components/PublicLanding.test.jsx`: add one test — landing renders the `Request Access` heading and both labeled fields (integration is real, not mocked), and the form section appears **after** the Quick Draw section in DOM order (e.g. `compareDocumentPosition` on the two `h2`s — pins the mockup ordering). Existing tests must pass unmodified — the form adds nothing account-shaped, so the "no account surface" pin stays green.
  - [x] `e2e/public-landing.spec.js`: add a second `test()` — goto `/`, assert the `Request Access` heading and fields visible, click submit with both fields empty → `Please enter your name.` visible; fill Name, fill Email with `not-an-email`, submit → email message visible. ⚠️ **Do NOT submit valid data in e2e** — it would fire a real SES send against the sandbox on every run; the one real send happens once, in Task 7.
  - [x] Full suite green: all 56 existing tests + new ones; `npm run lint`, `npm run typecheck`, `npm run build` pass. (The handler unit tests cover what mocks can prove; Task 7's live run covers what they can't — real secret resolution, IAM, SES delivery.)
- [x] **Task 7: Live sandbox verification** (AC: all)
  - [x] Backend changes require a sandbox deploy: `npx ampx sandbox --once` (`--once` deploys and exits instead of watch mode — agent-runnable; this regenerates the AppSync API key — note the fresh expiry date in the deferred-work line from Task 2). Confirm the prerequisites before deploying: `npx ampx sandbox secret list` shows `CUTOUT_EMAIL`, and the SES cutout identity shows verified.
  - [x] `npm run dev`, incognito: landing shows the form below Quick Draw. Empty submit → name message; bad email → email message (AC 2, 3).
  - [x] One real submission with test values → acknowledgment renders on-page (AC 1, 4); **confirm the email actually arrives** at the cutout inbox with the submitted name and email in the body (AC 1 — the whole point of retro action item #2's success criteria: "delivers on first live test"). ⚠️ If the send fails with an address error or CloudWatch shows `CUTOUT_EMAIL` as an unresolved SSM placeholder, apply Task 1's secret-resolution fallback (typed `$amplify/env` import + tsconfig `paths`) and redeploy.
  - [x] Verify no residue: no DynamoDB record anywhere, no confirmation email to the submitted address (AC 4).
  - [x] `npm run test:e2e` passes against the dev server. Narrow-viewport eyeball: fields wrap to one column, no horizontal scroll.
- [x] **Task 8: Close out (Definition of Done — Epic 1 retro action item #4)**
  - [x] All gates green: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
  - [x] Sweep the diff and this story file for live credentials/keys/secrets — ⚠️ this story's specific trap: **the real cutout email address must not appear in code, comments, tests, or this story file** (it lives only in the secret store); test submissions use obviously fake values.
  - [x] Commit and push to `main`.

## Dev Notes

### What already exists — do not rebuild any of this

- **`PublicLanding.jsx`** (Story 2.1) owns the landing: header auth-entries, hero, JTBD pills, Quick Draw section, and a `spreadKey` branch that swaps the whole page for `SpreadView`. This story only inserts one new section after Quick Draw. Do not touch the hero, pills, Quick Draw, auth entries, or the draw-state logic.
- **`Field.jsx`** is the app's one labeled-input component (label, id derivation, dark input treatment, focus ring) — reuse it as-is for both fields.
- **The public-Lambda pattern is fully established**: `check-invite-key` (public apiKey operation in the `data` resource group) + `inviteKeys.js` client util + the WAF scope-down rule set the *exposure* pattern; `invite-key-mint` sets the *handler* pattern — `createHandler(deps)` DI seam with a colocated `handler.test.ts` — and its `backend.ts` wiring is the grant template (Epic 1 retro: "the 1.2 `invite-key-mint` wiring is the established template"). `request-access` combines the two: public exposure like the former, testable handler shape like the latter, SES instead of DynamoDB.
- **SignUp.jsx** establishes every form behavior this story needs: `submittingRef` double-submit guard, `busy` disabled state with `Please wait…`, single `role="alert"` red-400 error line, friendly-message error mapping. Copy those patterns, not new ones.
- **`App.jsx` is untouched** this story — the form lives entirely inside `PublicLanding`. So are `index.html`, `vite.config.js`, `playwright.config.js`, and everything under `src/utils/deck.js` / spread components.

### Constraints & scope guards

- **FR5 is purely transactional, by design**: no account, no DB record, no waitlist position, no confirmation email to the requester, no dedup, no captcha/honeypot. The cutout address is deliberately disposable infrastructure ("if the form is abused, the mitigation is to retire that address" — PRD §4.2 note). Task 3's WAF rule is parity with existing infra, and it is the *only* abuse control in scope.
- **SES sandbox mode** (AD-15): sender AND recipient must both be verified identities; from = to = cutout makes that one verification. Getting out of sandbox mode (production access) is explicitly not needed and not this story's work.
- **No secrets in the repo** — the cutout address counts as one for sweep purposes (it's the disposability that protects it; publishing it in a public repo defeats that). `secret('CUTOUT_EMAIL')` is the mechanism; nothing address-shaped lands in git.
- **Frontend conventions bind** (AD-1, project-context.md): plain JSX in `src/`, default-export components / named-export utils, `useState` + refs only, exact dark Tailwind tokens inline, minimal comments, flat folders. TypeScript exists only under `amplify/`.
- **Voice and Tone**: plain and specific. The three validation/failure strings in the Copy table are the only new user-facing sentences besides the section copy — no cleverness, no exclamation marks beyond what's specced.
- **Mockup illustrates; spine wins** (EXPERIENCE.md): the mockup's placeholder attributes (`Priya Shah` / `priya@example.com`) and uppercase field-label styling are illustrative — `Field`'s real treatment governs; placeholders are omitted (Field doesn't support them, and labels carry the meaning).

### Previous story intelligence (2.1, GPT-5 Codex dev agent)

- Final state: 56 tests green, lint/typecheck/build/e2e green, committed through `4098596`. 2.1's reviews were adversarial across 3 passes — the recurring findings were a11y labels, Hub/session edge cases, and story-file audit-trail integrity (never delete task checklists; keep completion evidence numbers current).
- The Playwright foothold exists (chromium-only, `npm run test:e2e`, dev server via `webServer` config) — this story *extends* `e2e/public-landing.spec.js`, it does not create new harness.
- Established test bar (1.2→2.1): settled-state assertions only (`findBy*`/`waitFor`), DI props over module mocks where a seam exists, label/role queries, no assertions mid-transition, deterministic tests only in the always-on Vitest gate.
- E2e runs need `amplify_outputs.json` (gitignored, sandbox-generated) — e2e is a sandbox-machine concern, not CI. Same remains true this story.
- Live verification is a first-class task with real evidence, not a checkbox — 2.1 got a review finding for a checked-but-not-performed verification task. Task 7's email-arrival check is the one step only a human/live run can prove.

### Architecture compliance checklist (the ADs that bind this story)

- **AD-15**: SES sends the FR5 email; sandbox-mode one-time verification is a prerequisite, not code.
- **AD-4**: thin Lambda, one capability, no abstraction layers; no repository/service wrappers around the SES client.
- **AD-3 / paradigm**: capability lives at `amplify/functions/request-access/` (`resource.ts` + `handler.ts`), kebab-case, wired in `backend.ts`.
- **AD-9 scope note**: `requestAccess` is public-by-apiKey like `checkInviteKey` — it reads/writes no owned records, so owner-based rules aren't in play; don't add any model.
- **AD-8**: no new data models. FR5 creates no records — if an idea needs a table, it's the wrong idea for this story.
- **AD-1 / AD-2**: frontend stack and root base path unchanged.

### Latest tech notes (web-verified 2026-07-17)

- Amplify Gen 2 secrets: `npx ampx sandbox secret set <NAME>`; bind with `secret('<NAME>')` in `defineFunction`'s `environment`; branch deployments set the same secret in the Amplify console. Secret values are fetched at runtime, not baked into function config ([docs](https://docs.amplify.aws/react/build-a-backend/functions/environment-variables-and-secrets/)).
- SES v2 (`@aws-sdk/client-sesv2`, `SendEmailCommand`) is the current-generation API; IAM action for it is `ses:SendEmail`. Sandbox-mode accounts can only send to verified addresses/domains ([SES docs](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-using-sdk-programmatically.html)).

### Project Structure Notes

- New: `amplify/functions/request-access/resource.ts`, `amplify/functions/request-access/handler.ts`, `amplify/functions/request-access/handler.test.ts`, `src/utils/requestAccess.js`, `src/components/RequestAccess.jsx`, `src/components/RequestAccess.test.jsx`.
- Updated: `amplify/data/resource.ts` (mutation), `amplify/backend.ts` (function + SES grant + WAF rule), `src/components/PublicLanding.jsx` (one new section), `src/components/PublicLanding.test.jsx` (one new test), `e2e/public-landing.spec.js` (one new test), `package.json`/`package-lock.json` (`@aws-sdk/client-sesv2`), `_bmad-output/implementation-artifacts/deferred-work.md` (apiKey blast-radius note).
- NOT touched: `src/App.jsx`, `src/AppAuth.test.jsx`, `SignUp.jsx`, `LogIn.jsx`, `Field.jsx`, `SpreadSelector.jsx`, `SpreadView.jsx`, `CardDisplay.jsx`, `GrantInviteKey.jsx`, `src/utils/deck.js`, `amplify/auth/**`, `amplify/functions/check-invite-key/**`, `amplify/functions/invite-key-mint/**`, `index.html`, `vite.config.js`, `playwright.config.js`.

### References

- [Source: epics.md#Story-2.2] — story + the four ACs; [Source: epics.md#Epic-2] — FR5, AD-15 binding
- [Source: prd.md#FR-5] — consequences (cutout email, on-page ack, no persistence), Out of Scope (auto-approval, waitlist, confirmation email), notes (disposable infrastructure, no anti-abuse in v1, SM-1 signal caveat)
- [Source: ARCHITECTURE-SPINE.md#AD-15] — SES + sandbox verification; [#AD-4] — thin Lambda, per-function IAM; [#Design-Paradigm] — `amplify/functions/<capability>/` layout
- [Source: EXPERIENCE.md#Component-Patterns] — Request Access Form row (inline-validated, success = on-page ack only); [#State-Patterns] — "Request Access form invalid" / "Request Access success" rows; [#Voice-and-Tone]; [#Accessibility-Floor] — Request Access name/email labels named explicitly; [#Key-Flows] — Priya flow steps 4–5 (the journey this form completes)
- [Source: DESIGN.md#Colors] — `error` red-400 for malformed Request Access submission; [#Components] — Input row lists Request Access name/email as the unchanged input treatment
- [Source: mockups/public-landing.html] — section copy + layout (request-block panel, two-field row, left-aligned submit)
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-07-16.md] — action item #2 (SES verification, success = "delivers on first live test"), Epic 2 preview ("one new data-group Lambda… the 1.2 invite-key-mint wiring is the established template")
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — apiKey 30-day expiry decision (this story widens its blast radius)
- [Source: _bmad-output/implementation-artifacts/2-1-view-the-public-landing-page-with-a-free-quick-draw.md] — landing structure, test bar, e2e harness, live-verification standard
- [Source: amplify/functions/check-invite-key/*, amplify/backend.ts] — the public-Lambda + WAF-scope-down precedent this story mirrors
- Web-verified 2026-07-17: Amplify Gen 2 [function secrets](https://docs.amplify.aws/react/build-a-backend/functions/environment-variables-and-secrets/); SES v2 [SendEmail + sandbox rules](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-using-sdk-programmatically.html)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Build the SES handler behind a dependency-injection seam and prove validation, hardening, configuration, and command shape with unit tests.
- Expose the public mutation with narrowly scoped Lambda IAM and WAF parity.
- Add the API-key client utility and accessible landing-page form, then cover component, integration, and browser flows.
- Deploy only after the sandbox secret and SES identity prerequisites can be verified.

### Debug Log References

- 2026-07-17: RED handler suite failed because `request-access/handler.ts` did not exist; GREEN after adding the typed SES handler and dependency.
- 2026-07-17: RED UI/integration suites failed because `RequestAccess` and its landing integration did not exist; GREEN after adding the client utility, component, and landing section.
- 2026-07-17: `npx ampx sandbox secret list` reached AWS but failed with `InvalidCredentialError`: the configured SSO token is expired. Live deploy and delivery verification remain open.

### Completion Notes List

- Implemented Tasks 1–6: SES Lambda, schema mutation, least-scope IAM/WAF wiring, frontend client, accessible request form, and automated coverage.
- Validation passed: 71/71 Vitest tests, ESLint, TypeScript, production build, and 2/2 Playwright tests.
- Credential sweep found only obviously fake `.test`/`example.com` addresses; no live cutout address or secret value is present.
- Live sandbox verification completed: validation states passed, the mutation acknowledgment rendered, Lambda/SES completed without error, and Tony confirmed the message arrived in the cutout mailbox.
- The original same-address sender was accepted by the mailbox provider but silently filtered. With Tony's approval, the implementation now uses `ACCESS_FROM_EMAIL` from a verified Route 53 domain with SES DKIM `SUCCESS`; the private cutout address remains only in `CUTOUT_EMAIL`.
- No request-access data model or DynamoDB writes exist, and requester addresses appear only in the email body; no confirmation email is sent to the requester.
- Implementation committed and pushed to `main` as `87b128d`.

### File List

- _bmad-output/implementation-artifacts/2-2-request-access-via-the-form.md
- _bmad-output/implementation-artifacts/deferred-work.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- amplify/backend.ts
- amplify/data/resource.ts
- amplify/functions/request-access/handler.test.ts
- amplify/functions/request-access/handler.ts
- amplify/functions/request-access/resource.ts
- e2e/public-landing.spec.js
- package-lock.json
- package.json
- src/components/PublicLanding.jsx
- src/components/PublicLanding.test.jsx
- src/components/RequestAccess.jsx
- src/components/RequestAccess.test.jsx
- src/utils/requestAccess.js

## Change Log

- 2026-07-17: Implemented and locally validated the request-access capability; live sandbox verification remains blocked by expired AWS SSO credentials.
- 2026-07-17: Completed live delivery using a DKIM-authenticated domain sender after mailbox filtering made the original same-address sender unreliable.
