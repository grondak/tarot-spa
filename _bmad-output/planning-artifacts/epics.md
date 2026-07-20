---
stepsCompleted: [1, 2, 3]
updated: '2026-07-19'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-tarot-spa-2026-07-09/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-tarot-spa-2026-07-09/EXPERIENCE.md
---

# tarot-spa Multiuser + LLM Orientation Guide - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for tarot-spa's multiuser + LLM Orientation Guide release, decomposing the requirements from the PRD, UX Design (DESIGN.md + EXPERIENCE.md), and Architecture (ARCHITECTURE-SPINE.md) into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: A prospective user holding a valid, unredeemed Invite Key can create an Account. System rejects account creation with an invalid, already-redeemed, or revoked Invite Key (distinct messaging per reason). Each Invite Key redeems to exactly one Account.
FR2: A First-Gen Account can generate exactly one Invite Key to grant onward, creating a Second-Gen Account upon redemption. System prevents generating more than one onward key; Second-Gen Accounts have no path to generate a further key.
FR3: Tony can generate and issue new First-Gen Invite Keys directly (to friends, or in response to approved FR5 requests) — no ceiling on how many.
FR4: Any visitor, unauthenticated, can view a public landing page presenting the PR-FAQ content. Exposes no Session or Account functionality, plus hosts the public Quick Draw capability.
FR5: Any visitor can submit a name + email request for access. Submission emails Tony's cutout address; requester sees a simple on-page acknowledgment; no account/DB record/waitlist position created.
FR6: An authenticated user can enter freeform, multi-paragraph Context text describing their situation before drawing, with a contextual hint/placeholder shown.
FR7: An authenticated user selects a Spread (Single, Three, Decision, System — existing configurations, unchanged).
FR8: An authenticated user with remaining Daily Orientation Limit can trigger a Draw and receive an Orientation Guide via a single "Help Me Orient" action: Draws Card(s) per Spread, sources exactly 3 Current Events via live search, generates one Lens then one essay-form Orientation Guide applying that Lens to the Context in a single LLM call. Output must demonstrably incorporate specific Context details (not restate the Card abstractly), follow the 5-part structure (pattern-in-situation, what's missing, framing challenge, counterintuitive implication, better questions), and consume one Daily Orientation Limit unit per completed request (including misses).
FR9: The system enforces a configurable maximum number of Orientation Guide requests per Account per calendar day (UTC), server-side enforced, rejected with a clear explicit message when exceeded — but per EXPERIENCE.md's UX supersession, gracefully degrades to the free Quick Draw experience with a playful note instead of a hard block.
FR10: The system enforces a configurable aggregate monthly spend ceiling across all Accounts combined (default $30/month), with proactive push alerting at a warning threshold and a hard stop (or throttle) at the ceiling.
FR11: Tony can view an Admin Dashboard showing number of users (by generation), number of Sessions, Daily Orientation Limit hit-rate, and aggregate spend against the FR10 ceiling — admin-only, at least daily-refreshed, aggregate-only (no raw Context/Guide content viewer).
FR12: Tony can mint a new First-Gen Invite Key directly from the Admin Dashboard.

### NonFunctional Requirements

NFR1 (Security): Invite Key redemption and Cognito authentication gate all Session data. No Account can access another Account's Context, Draw, or Orientation Guide.
NFR2 (Reliability): A failed Current Events search or LLM call degrades gracefully (clear user-facing error) rather than silently failing, and must not consume a Daily Orientation Limit unit. A slow-but-not-failed Current Events search times out (20s) and proceeds without grounding rather than hanging — and this still counts as a successful completion for rate-limit/budget purposes.
NFR3 (Observability): The Admin Dashboard is the primary observability surface for v1. The one push-based exception is FR10's budget alert — Tony must not have to remember to check the dashboard to learn the cost ceiling is at risk.
NFR4 (Performance/Cost enforcement): Daily Orientation Limit enforcement is server-side; a client-side-only cap is not acceptable, since the entire point is bounding real infrastructure spend.
NFR5 (Latency, benchmarked): Prompt acknowledgment targets ≤3 seconds and must remain inside AppSync's response boundary. Full generation is asynchronous; current live evidence is approximately 30.6–30.7 seconds and the client follows the exact Session until terminal status.
NFR6 (Cost ceiling): $30/month aggregate budget is the hardest constraint on this release; hosting/fixed costs are kept near-zero so Bedrock + search usage is the only real variable cost.
NFR7 (Privacy): Context and Orientation Guide content remain visible only to the Account that created them; no built-in admin raw-content viewer (deliberate architecture decision, ADR AD-10).

### Additional Requirements

**Starter/backend template (Architecture AD-3) — impacts Epic 1 Story 1:** AWS Amplify Gen 2 is the confirmed backend starter — a code-first TypeScript backend definition (`amplify/` folder) provisioning Cognito Auth, AppSync GraphQL + DynamoDB Data, and Lambda Functions together. This is the first thing that needs scaffolding before any other backend work can proceed.

- Thin Lambda-function-per-capability paradigm, no repository/DI abstraction layers (AD-4); server-side writes go through Amplify Gen 2's IAM-authorized function-scoped data client, never client-facing mutations.
- Claude Opus via Bedrock for generation; Tavily called directly via plain HTTP from the Orientation Guide Lambda for Current-Events grounding — not a Bedrock-native agentic tool (AD-5). Implementation note: current-gen Opus needs an inference-profile identifier, not a bare model ID.
- Two-phase atomic reservation for rate-limit/budget enforcement: pre-flight atomic check-and-increment of DailyUsage + MonthlySpend against Config-defined ceilings, compensating rollback only on outright Tavily/Bedrock failure — a Tavily timeout-then-ungrounded-Guide still counts as success (AD-6, AD-14).
- Calendar day = UTC for the Daily Orientation Limit (AD-7); per-user timezone display explicitly deferred, not v1.
- Data model: Account (`generation`, `onwardKeyGenerated`), InviteKey, Session, DailyUsage (key `accountId#date`), MonthlySpend (key `year-month`), Config (`dailyLimit`, `monthlyBudget`) (AD-8, AD-13, AD-17).
- Authorization: Amplify Data owner-based rule for Account/Session/DailyUsage; MonthlySpend has no owner-based rule (admin-group-read-only, Lambda-IAM-write-only); Admin Dashboard/key-minting gated via Cognito group/custom claim (AD-9).
- Invite Key redemption is a single atomic conditional UpdateItem performed inside a Cognito post-confirmation Lambda trigger — not a client-orchestrated API call — with same-identity multi-key redemption prevented via verified-email uniqueness (AD-16).
- Onward-key-mint eligibility (FR2) is a single atomic conditional UpdateItem on Account (`generation = FirstGen AND onwardKeyGenerated = false`), never derived by querying InviteKey records; Tony's direct admin-mint (FR3) is a separate admin-gated path with no eligibility check (AD-17).
- Admin Dashboard aggregates (FR11) are computed by a dedicated `admin-metrics` Lambda, not client-side list-query aggregation (AD-18).
- Deployment: `staging` + `main` as fully isolated Amplify branch environments (own Cognito pool/DynamoDB/Lambda each); staging password-protected; changes land on staging first, promote to main by merge (AD-11).
- GitHub Pages hosting and its `.github/workflows/deploy.yml` pipeline are retired in favor of Amplify Hosting; the `/tarot-spa/` base path drops to `/` — old bookmarked/shared links under the old path break, accepted (AD-2, AD-11).
- Frontend stack stays exactly as-is: React 19.2 + Vite 7.3 + Tailwind CSS v4 (CSS-first) + plain JS/JSX, no TypeScript at runtime, ESLint 9 flat config (AD-1). Amplify's own TypeScript-as-code backend definitions live only in `amplify/`, never extending into `src/`.
- The existing client-only `encodeDraw`/`decodeDraw` draw-code sharing mechanism carries forward completely unchanged, used only by Quick Draw — Orientation Guide Sessions use the new persisted Session model instead; the two never share a code path (AD-12).
- Amazon SES sends the FR5 Request-Access email to Tony's cutout address; sandbox mode requires a one-time recipient verification (AD-15).

### UX Design Requirements

UX-DR1: Implement the dark-theme color token set (`surface`/`surface-container`/`outline`/`on-surface` family, `primary`/`primary-strong`/`on-primary`/`primary-container`, `inverted-accent`, `error`) exactly matching the existing app's real Tailwind classes — no new palette introduced.
UX-DR2: Implement the new `body-essay` typography role (18px/1.75 line-height, ~65ch constrained reading measure) for the Orientation Guide essay text — distinct from the existing terse `body`/`label-caps` treatment used everywhere else in the app.
UX-DR3: Build the new Ornamental Divider component (❦ hedera/fleuron glyph flanked by thin hairline rules) — used only bracketing the Context Entry screen (top+bottom) and the bottom of the Orientation Guide Results screen; deliberately absent from Quick Draw, Sign Up, and the Admin Dashboard.
UX-DR4: Give the existing Spread Selector its own explicit visual spec (reused verbatim across Context Entry, authenticated Quick Draw, and public Quick Draw) — no visual delta from today, just formalized as a first-class component.
UX-DR5: Build a new Key/Code Display component (monospace chip, matching the existing draw-code chip treatment) for the Grant Invite Key action's generated code.
UX-DR6: Carry the existing Card Display component (image, name, pattern text, questions/examples, position-label sub-element, inverted-state amber treatment) forward completely unchanged — reused in Quick Draw and the Orientation Guide Results card rundown.
UX-DR7: Stay dark-mode-only — no light/dark toggle to build for this release.
UX-DR8: Build the Public Landing screen: PR-FAQ pitch content + the full public Quick Draw capability (no login required) + the Request Access form, all on one page.
UX-DR9: Build the Sign Up / Redeem Invite Key screen with three distinct rejection states (invalid / already-redeemed / revoked key) — not one generic error — per the Voice and Tone spec.
UX-DR10: Build the Context Entry screen: hint-anchored Context textarea (submission blocked while blank/whitespace-only, no request sent), the Spread Selector, and the "Help Me Orient" primary CTA (inert while Context is blank).
UX-DR11: Build the Orientation Guide Results screen: drawn cards at top, Current Events rundown, the Orientation Guide Essay (continuous `body-essay` prose covering FR8's five-part structure), then two distinct redraw actions — "Provide another observation" (clears Context) and "Tweak existing observation" (preserves Context for editing).
UX-DR12: Build Quick Draw mode (public + authenticated variants) — Spread selection, cards, Draw Again, load-a-draw-code — with zero LLM/DB-write involvement, free and unlimited.
UX-DR13: Build the Rate-Limited Intake state: when the Daily Orientation Limit is exhausted, Context Entry's whole screen degrades to the Quick Draw experience plus a short playful inline note ("the news is slow today" register, not a dry rejection message) instead of a hard block.
UX-DR14: Build the Grant Invite Key action (account/profile area, First-Gen accounts only): single action producing one onward Invite Key as a copyable code; disabled/hidden once already used.
UX-DR15: Build the Admin Dashboard as a plain metrics list/table + a "Mint Key" button — deliberately low design investment ("ugly but functional"), reusing existing components as-is, no charts/graphs.
UX-DR16: Rely entirely on native browser text-selection + OS copy/paste for sharing an Orientation Guide phrase — no custom share button or share-sheet integration to build.
UX-DR17: Meet the accessibility floor: every form input has an associated label even where visually minimal; existing focus-visible treatment carries forward on every new input/button; tab order matches reading/visual order on every new screen.
UX-DR18: Build every new screen as a single responsive layout using the existing Tailwind breakpoint set — no separate mobile app, no separate mobile IA, the same markup resizes.
UX-DR19: Implement the specific Voice and Tone microcopy rules from EXPERIENCE.md's Do/Don't table (e.g. the playful rate-limit note, the three distinct Invite Key rejection messages, the plain numeric Admin Dashboard copy, the Context hint copy verbatim) rather than generic placeholder copy.

### FR Coverage Map

FR1: Epic 1 - Account creation via Invite Key
FR2: Epic 1 - First-Gen grant capability (one onward key)
FR3: Epic 4 - Tony-issued First-Gen keys (Story 4.2, admin mint)
FR4: Epic 2 - Public landing page (PR-FAQ + public Quick Draw)
FR5: Epic 2 - Request-access form
FR6: Epic 3 - Context entry
FR7: Epic 3 - Spread selection
FR8: Epic 3 - Orientation Guide generation ("Help Me Orient")
FR9: Epic 3 - Configurable daily cap
FR10: Epic 3 - Aggregate monthly budget cap & alerting
FR11: Epic 4 - Admin metrics dashboard
FR12: Epic 4 - Admin-issued Invite Keys

## Epic List

### Epic 1: Multiuser Accounts & Invite Keys
Users can join tarot-spa with a valid Invite Key and, if First-Gen, invite exactly one friend onward. Includes standing up the Amplify Gen 2 backend itself (Cognito, the data layer, the Lambda scaffold) — this has to exist before anything else backend-related can be built.
**FRs covered:** FR1, FR2

### Epic 2: Public Landing & Access Requests
Anyone (no account needed) can land on the public page, read the pitch, try a free Quick Draw, and ask for access.
**FRs covered:** FR4, FR5

### Epic 3: Draw & Orientation Guide
The core product: an authenticated user describes their situation, draws cards, and gets a real LLM-generated Orientation Guide — bounded by the two-layer daily/monthly cost controls baked into the same request flow.
**FRs covered:** FR6, FR7, FR8, FR9, FR10

### Epic 4: Admin Dashboard
Tony can see what's happening (usage/spend metrics) and mint new Invite Keys — his own operating console.
**FRs covered:** FR11, FR12

## Epic 1: Multiuser Accounts & Invite Keys

Users can join tarot-spa with a valid Invite Key and, if First-Gen, invite exactly one friend onward. Includes standing up the Amplify Gen 2 backend itself (Cognito, the data layer, the Lambda scaffold) — this has to exist before anything else backend-related can be built.

**FRs covered:** FR1, FR2 | **Architecture:** AD-3 (Amplify Gen 2 scaffold), AD-8 (Account/InviteKey model), AD-16 (redemption atomicity), AD-17 (onward-key eligibility atomicity) | **NFRs:** NFR1 | **UX-DRs:** UX-DR5, UX-DR9, UX-DR14

### Story 1.1: Redeem an Invite Key to create an Account

As a friend holding a valid Invite Key,
I want to enter my key and create an account,
So that I can start using tarot-spa.

*(Stands up the Amplify Gen 2 backend — Cognito, Account/InviteKey data models, the post-confirmation redemption trigger — as the technical foundation this story requires.)*

**Acceptance Criteria:**

**Given** a visitor holds a valid, unredeemed Invite Key
**When** they enter the key and complete Cognito signup
**Then** an Account is created with the generation inherited from the key, and the key's status flips to redeemed

**Given** a visitor enters an invalid Invite Key
**When** they attempt signup
**Then** they see "This key isn't valid" and no Account is created

**Given** a visitor enters an already-redeemed Invite Key
**When** they attempt signup
**Then** they see "This key's already been used" and no Account is created

**Given** a visitor enters a revoked Invite Key
**When** they attempt signup
**Then** they see "This key was revoked" and no Account is created

**Given** two concurrent signup attempts using the same unredeemed key
**When** both submit at nearly the same time
**Then** only one Account is created; the other is rejected as already-redeemed (AD-16 atomicity)

**Given** someone who already has an Account
**When** they attempt to redeem a second Invite Key under the same verified email
**Then** the second signup is rejected (AD-16 same-identity check)

**Given** this is the first new screen built for this release
**When** it renders on any viewport
**Then** it uses DESIGN.md's dark color tokens (no light mode/toggle), resizes fluidly across desktop and phone with no separate mobile layout, and every input/button carries an associated label and visible focus state (UX-DR1, UX-DR7, UX-DR17, UX-DR18) — the baseline every subsequent screen in this release also follows

### Story 1.2: Grant one Invite Key onward (First-Gen only)

As a First-Gen Account holder,
I want to generate one Invite Key to give to a friend,
So that I can bring someone I know into tarot-spa.

**Acceptance Criteria:**

**Given** a First-Gen Account that hasn't generated its onward key yet
**When** they trigger "Grant Invite Key"
**Then** a new unredeemed Second-Gen InviteKey is created and shown as a copyable code (UX-DR5, UX-DR14)

**Given** a First-Gen Account that has already generated its onward key
**When** they view the Grant Invite Key action
**Then** it's disabled/hidden with a plain confirmation they've already granted it — not an error

**Given** a Second-Gen Account
**When** they look anywhere in the UI for a way to generate an onward key
**Then** no such action exists

**Given** two rapid duplicate-submit clicks on "Grant Invite Key" from the same First-Gen Account
**When** both requests race
**Then** only one InviteKey is ever created (AD-17 atomicity)

**Given** a Second-Gen account calls the mint mutation directly, bypassing the UI
**When** the request reaches the Lambda
**Then** it's rejected server-side regardless of UI affordance (AD-17)

### Story 1.3: Log in to an existing Account

As an Account holder who has already signed up,
I want to log in with my credentials,
So that I can return to my authenticated home without redeeming a key again.

**Acceptance Criteria:**

**Given** an Account holder with valid credentials
**When** they log in
**Then** they land on their authenticated home (Context Entry) with a valid session

**Given** an Account holder enters an incorrect password
**When** they attempt to log in
**Then** they see a clear error and are not authenticated

**Given** an authenticated Account holder's session is still valid
**When** they navigate directly to an authenticated URL later
**Then** they aren't prompted to log in again until the session expires

### Story 1.4: Log out

*(No PRD FR number — surfaced during party-mode review: every authenticated app needs a way to end a session, and nothing in the original document covered it.)*

As an authenticated Account holder,
I want to log out,
So that I can end my session on a shared or public device.

**Acceptance Criteria:**

**Given** an authenticated user selects "Log Out"
**When** the action completes
**Then** their session is terminated and they're returned to the Public Landing page

**Given** a logged-out user
**When** they navigate to an authenticated URL
**Then** they're redirected to login rather than shown authenticated content

## Epic 2: Public Landing & Access Requests

Anyone (no account needed) can land on the public page, read the pitch, try a free Quick Draw, and ask for access.

**FRs covered:** FR4, FR5 | **Architecture:** AD-15 (SES email) | **UX-DRs:** UX-DR8, UX-DR12

### Story 2.1: View the public landing page with a free Quick Draw

As a visitor without an account,
I want to see what tarot-spa is about and try drawing cards for free,
So that I can decide whether I want to ask for access.

**Acceptance Criteria:**

**Given** an unauthenticated visitor navigates to the root URL
**When** the page loads
**Then** they see the PR-FAQ pitch content with no Session or Account functionality exposed

**Given** an unauthenticated visitor is on the landing page
**When** they select a Spread and draw
**Then** they see their drawn card(s) with pattern/questions/examples — no login required, no LLM/backend call involved (UX-DR12)

**Given** an unauthenticated visitor has drawn cards
**When** they use "Draw Again"
**Then** a new draw is made instantly, same as the existing app's unchanged behavior

**Given** an unauthenticated visitor has a draw code
**When** they enter it under "load a draw"
**Then** the corresponding cards load — existing behavior, unchanged (AD-12)

**Given** an unauthenticated visitor on the landing page already holds an Invite Key
**When** they select "I have an Invite Key"
**Then** they're taken to Sign Up / Redeem (Story 1.1)

**Given** an unauthenticated visitor on the landing page already has an Account
**When** they select "Log In"
**Then** they're taken to the login screen (Story 1.3) — distinct from the redemption path

### Story 2.2: Request access via the form

As a visitor who wants deeper access,
I want to submit my name and email requesting an Invite Key,
So that Tony can follow up and grant me one.

**Acceptance Criteria:**

**Given** a visitor fills in a valid name and email and submits
**When** the request is sent
**Then** Tony's cutout address receives an email with the submitted name and email (via SES, AD-15), and the visitor sees a simple on-page acknowledgment

**Given** a visitor submits with an empty name
**When** they attempt to submit
**Then** submission is blocked inline with a validation message and no email is sent

**Given** a visitor submits with a malformed email
**When** they attempt to submit
**Then** submission is blocked inline with a validation message and no email is sent

**Given** a successful submission
**When** the visitor looks for a waitlist position or confirmation email
**Then** none exists — the on-page acknowledgment is the only feedback (FR5 Out of Scope)

## Epic 3: Draw & Orientation Guide

The core product: an authenticated user describes their situation, draws cards, and receives a real LLM-generated Orientation Guide through a durable asynchronous execution — bounded by atomic daily/monthly cost controls and tracked through an exact owner-readable Session.

**FRs covered:** FR6, FR7, FR8, FR9, FR10 | **Architecture:** AD-5 (Bedrock+Tavily split), AD-6 (two-phase atomic reservation), AD-7 (UTC), AD-13 (Config), AD-14 (Tavily timeout), AD-19 (durable async generation) | **NFRs:** NFR2, NFR4, NFR5, NFR6 | **UX-DRs:** UX-DR2, UX-DR3, UX-DR4, UX-DR6, UX-DR10, UX-DR11, UX-DR13, UX-DR16, UX-DR19

Story 3.5 (groundedness scoring) has no PRD FR number — it's a post-PRD addition instrumenting FR8's own "grounded vs. abstract" quality bar, surfaced during epic/story review rather than in the original document. Stories 3.2–3.4 were split from a single original story per Amelia's review: 3.2 is the backend generation/reservation flow, 3.3 is viewing the results, 3.4 is the redraw actions — kept separate because they're different work (Lambda vs. frontend vs. a small self-contained action), not because they're different atomic mechanisms.

**Correct-course priority:** Story 3.8 preserves the established 3.4–3.7 identifiers but executes immediately after Story 3.3's deployed implementation. It gates Stories 3.4 and 3.5. Story 3.3 remains frozen in review until Story 3.8 and the retained Results UI receive an integrated review.

### Story 3.1: Enter Context and pick a Spread

As an authenticated user with something to decide,
I want to describe my situation and pick a Spread,
So that I'm ready to get oriented.

**Acceptance Criteria:**

**Given** an authenticated user is on Context Entry
**When** the screen loads
**Then** they see the contextual hint placeholder in the Context field and the four existing Spreads to choose from (UX-DR10)

**Given** the Context field is blank or whitespace-only
**When** the user attempts to submit
**Then** submission is blocked inline and no request is sent (FR6)

**Given** Context has real text and a Spread is selected
**When** the user views "Help Me Orient"
**Then** it's active

**Given** the Context field is blank
**When** the user views "Help Me Orient"
**Then** it's inert

**Given** the Context Entry screen renders
**When** the user views the top and bottom of the screen
**Then** the Ornamental Divider (❦ glyph + hairline rules) brackets both ends — the only screen besides Orientation Guide Results where it appears (UX-DR3)

**Given** Context Entry receives a flag indicating the Daily Orientation Limit is exhausted (computed elsewhere — Story 3.2 — and passed in; this story builds the presentational state only)
**When** the screen renders with that flag set
**Then** it shows Rate-Limited Intake instead — degrading to the free Quick Draw experience with a playful note, not a hard rejection (UX-DR13) — this is a Context Entry state, not a Results-screen concern

### Story 3.2: Generate an Orientation Guide, bounded by the Daily and Monthly limits

As an authenticated user with remaining Daily Orientation Limit,
I want to submit my Context and have the system generate a real Orientation Guide,
So that I get a genuine LLM-backed reframing, not just a card draw.

*(Backend/Lambda flow only — testable against the Lambda directly, independent of the Results screen existing yet. This story creates the Config item, since it's the first story that needs it to exist; Story 4.3 only ever edits it.)*

**Acceptance Criteria:**

**Given** the Config item does not yet exist (first deployment)
**When** this story's infrastructure is stood up
**Then** a single Config item is seeded with sensible default values for `dailyLimit` and `monthlyBudget` (AD-13) — Story 4.3 only edits this item later, never creates it

**Given** a user with remaining Daily Orientation Limit submits Context+Spread
**When** they tap "Help Me Orient"
**Then** the system atomically reserves one DailyUsage unit and the estimated MonthlySpend cost up front (AD-6), draws Card(s), calls Tavily for exactly 3 Current Events, then calls Claude Opus to produce an essay-form Guide covering FR8's five-part structure

**Given** the Orientation Guide references the drawn Card
**When** the essay is generated
**Then** it uses the Card's idea as an Oblique Strategy shaping the discussion (not a literal name-drop) and demonstrably weaves in specific details from the user's own Context

**Given** the Tavily call is still running past 20 seconds
**When** the timeout fires
**Then** the system proceeds to Claude Opus without grounding, and this still counts as a successful completion for both counters (AD-14)

**Given** the Tavily or Bedrock call fails outright (not a timeout)
**When** the failure occurs
**Then** the earlier reservation is rolled back — no Daily Orientation Limit unit or MonthlySpend estimate is consumed (AD-6 rollback, FR8 NFR)

**Given** aggregate monthly spend has reached the FR10 ceiling
**When** any user submits a request, regardless of their own remaining Daily Limit
**Then** it's rejected with a clear message — the monthly ceiling is a global stop

**Given** an authenticated user's DailyUsage for the current UTC day already equals the configured cap, before any new request is made
**When** they load their authenticated home
**Then** this story computes and passes the "limit exhausted" flag that Story 3.1's Context Entry renders as Rate-Limited Intake

### Story 3.3: View the Orientation Guide Results screen

As an authenticated user who just requested an Orientation Guide,
I want to see my drawn cards, the current events, and the essay clearly laid out,
So that I can actually read and absorb the reframing.

**Acceptance Criteria:**

**Given** the Orientation Guide is generated
**When** the Results screen renders
**Then** it shows the drawn cards, the Current Events rundown, and the essay in `body-essay` typography at a constrained reading measure (UX-DR2, UX-DR11)

**Given** the Tavily call timed out and the Guide was generated without grounding (Story 3.2)
**When** the Results screen renders
**Then** it shows the playful "the news is slow today" note (AD-14)

**Given** the Orientation Guide Results screen renders
**When** the user scrolls to the bottom, past the essay
**Then** the Ornamental Divider appears once, above the redraw actions — this screen does not get a top divider, only Context Entry gets both (UX-DR3)

**Given** a user highlights a phrase in the essay
**When** they use native browser copy
**Then** it copies normally — no custom share UI exists (UX-DR16)

### Story 3.8: Make Orientation Guide generation durable and asynchronous

As an authenticated user requesting an Orientation Guide,
I want generation to continue reliably beyond the initiating API response and remain tied to my exact request,
So that I receive the Guide I paid for without timeout ambiguity, duplicate charges, or another Session being mistaken for mine.

**Acceptance Criteria:**

**Given** valid Context, Spread, and a client-generated request ID
**When** the user submits
**Then** the starter conditionally creates an owner-readable `PENDING` Session and returns `{ sessionId, status }` within the prompt-acknowledgment target without waiting for Tavily or Bedrock

**Given** the same owner, request ID, Context, and Spread are submitted again
**When** the starter handles the duplicate
**Then** it returns the existing Session and starts no additional execution; reusing the ID with different inputs returns `IDEMPOTENCY_CONFLICT`

**Given** an accepted Session
**When** its version-pinned worker runs
**Then** it transitions the Session to `RUNNING`, reads one Config snapshot, atomically reserves usage/spend, draws cards, calls Tavily, calls Bedrock, and transitions the Session to `SUCCEEDED` with the existing result contract

**Given** an outright Draw, Tavily, Bedrock, or output-validation failure after reservation and before a successful Bedrock result is checkpointed
**When** the execution terminates
**Then** compensation completes idempotently before the Session becomes `FAILED`, and its stable `errorCode` drives the existing user-facing treatment

**Given** a successful Bedrock result has been checkpointed but updating the Session transiently fails
**When** the durable worker resumes
**Then** it retries persistence from the checkpoint without intentionally calling Bedrock again; the reservation remains because real provider spend occurred, and exhausted persistence retries raise an operational alert rather than falsely reporting compensation

**Given** Tavily exceeds 20 seconds
**When** its timeout fires
**Then** the durable worker continues to Bedrock without grounding, reaches `SUCCEEDED`, retains `tavilyTimedOut: true`, and does not compensate the reservation

**Given** the durable runtime replays or retries any step
**When** state-changing operations execute again
**Then** Session creation, reservation, compensation, Bedrock-result persistence, and terminal transitions produce no duplicate usage, spend, or completed Guide

**Given** generation is in progress
**When** the client checks completion
**Then** it fetches only the returned Session ID; it never lists Sessions, establishes a newest-row baseline, or re-submits because of timeout

**Given** an active Session ID has been stored locally
**When** the browser reloads or the app restarts under the same authenticated owner
**Then** the application resumes that exact Session, and the ID is cleared on sign-out or deliberate exit from Results

**Given** lifecycle changes occur
**When** the client renders them
**Then** `PENDING`/`RUNNING` use the existing loading treatment, `SUCCEEDED` renders the existing Results screen, Daily-limit failure degrades to Quick Draw, and other failures use the existing accessible inline messages

**Given** Sessions created before lifecycle fields existed
**When** Story 3.8 deploys
**Then** they are safely backfilled or unambiguously treated as `SUCCEEDED`; no existing Context, cards, events, or Guide content is lost

**Given** a real generation exceeds AppSync's former response boundary
**When** live verification runs
**Then** the starter acknowledgment succeeds promptly, the background worker reaches `SUCCEEDED`, the exact Guide renders, and DailyUsage/MonthlySpend each change exactly once; failed and abnormally long executions are observable without logging Context or Guide bodies

### Story 3.4: Redraw from the Results screen

As a user viewing their Orientation Guide Results,
I want to either start fresh or tweak my observation and try again,
So that I can get another attempt if the first one didn't land or I want to add detail.

*Prerequisite: Story 3.8's durable start and exact-Session tracking contract is deployed and verified.*

**Acceptance Criteria:**

**Given** a completed Orientation Guide, win or miss
**When** the user views Results
**Then** they see two distinct actions — "Provide another observation" and "Tweak existing observation"

**Given** the user selects "Provide another observation"
**When** they're returned to Context Entry
**Then** the Context field is empty

**Given** the user selects "Tweak existing observation"
**When** they're returned to Context Entry
**Then** the prior Context text is pre-filled for editing

**Given** either redraw action is used
**When** the new request is submitted
**Then** it uses Story 3.8's asynchronous start contract and is subject to the same Daily/Monthly limit rules as any other request (Story 3.2)

### Story 3.5: Score Orientation Guide groundedness (async)

As Tony,
I want each Orientation Guide scored for how well it's grounded in the user's own Context,
So that I have a real, trended signal on the "abstract miss" quality risk (FR8's quality bar) instead of a gut feeling.

**Acceptance Criteria:**

**Given** a Session's Orientation Guide has just been delivered to the user
**When** that Session transitions to `SUCCEEDED`
**Then** an async judge Lambda call is triggered from that transition — never from initial `PENDING` creation or `FAILED`, and never blocking the user-facing response

**Given** the judge call runs
**When** it evaluates the essay against the Context
**Then** it extracts each concrete claim in the essay and identifies whether it anchors to a specific phrase in the Context, producing a structured list plus a floaters-over-total groundedness score

**Given** the judge call completes
**When** the score is computed
**Then** it's written back to the Session record as `groundednessScore`

**Given** the judge call is a separate, simpler task than generation
**When** choosing a model
**Then** it uses a cheaper Claude tier (e.g. Haiku) rather than Opus, to avoid roughly doubling the per-Session LLM cost

**Given** the judge call fails or times out
**When** that happens
**Then** the Session's already-delivered Guide is unaffected and the score is simply left unset — no user-facing impact, no rollback of DailyUsage/MonthlySpend (this is a monitoring signal, not a generation gate)

### Story 3.6: Alert Tony when the monthly budget nears its ceiling

As Tony,
I want to be proactively notified when spend approaches the monthly ceiling,
So that I don't have to remember to check the dashboard to catch a runaway cost.

**Acceptance Criteria:**

**Given** aggregate spend crosses the configured warning threshold (e.g. 80%) of the monthly budget
**When** the threshold is crossed
**Then** Tony receives a push notification (email/SMS via AWS Budgets + SNS) — not something he has to notice on the dashboard (NFR3)

**Given** aggregate spend is well under the warning threshold
**When** nothing unusual happens
**Then** no alert fires — this is a genuine threshold alert, not noisy per-request notification

### Story 3.7: Draw for fun without spending your daily limit (authenticated Quick Draw)

*(No PRD FR number — EXPERIENCE.md's IA names this as its own reachable surface, "alternate entry to Context Entry," but only its rate-limited-fallback form (Story 3.1) had a story; the deliberate, chosen-on-purpose path was never built.)*

As an authenticated user who still has Daily Orientation Limit remaining,
I want to draw cards without triggering an Orientation Guide,
So that I can play with the deck without spending a limited resource I might want to save.

**Acceptance Criteria:**

**Given** an authenticated user is on their authenticated home
**When** they choose Quick Draw instead of "Help Me Orient"
**Then** they reach the same free, unlimited Quick Draw experience as the public version — no LLM call, no Daily Orientation Limit unit consumed

**Given** an authenticated user is in Quick Draw
**When** they want to return to the Orientation flow
**Then** they can navigate back to Context Entry directly

**Given** an authenticated user has already exhausted their Daily Orientation Limit
**When** they reach their authenticated home
**Then** they land in this same Quick Draw experience by default (Story 3.1's Rate-Limited Intake) rather than a separate screen — it's one consistent experience whether chosen deliberately or arrived at via the limit

## Epic 4: Admin Dashboard

Tony can see what's happening (usage/spend metrics) and mint new Invite Keys — his own operating console.

**FRs covered:** FR11, FR12 | **Architecture:** AD-18 (admin-metrics Lambda), AD-9 (admin-group auth), AD-13 (Config editing) | **NFRs:** NFR3 | **UX-DRs:** UX-DR15

### Story 4.1: View usage & spend metrics

As Tony,
I want to see usage and spend metrics for the whole app,
So that I can tell what's actually happening without digging through raw data.

**Acceptance Criteria:**

**Given** Tony's admin-flagged Account
**When** he opens the Admin Dashboard
**Then** he sees users by generation, total `SUCCEEDED` Session count, Daily Orientation Limit hit-rate, aggregate spend-to-date against the FR10 ceiling, and average `groundednessScore` across scored Sessions (Story 3.5) — all computed by the admin-metrics Lambda (AD-18); `PENDING` and `FAILED` lifecycle records do not inflate delivered-Guide metrics

**Given** a non-admin Account
**When** they attempt to reach the Admin Dashboard
**Then** the surface is hidden from their navigation entirely — not a visible-but-blocked screen

**Given** the metrics were last computed some time ago
**When** Tony views the dashboard
**Then** a "last refreshed" timestamp is visibly shown as plain text

**Given** the dashboard renders
**When** Tony looks at it
**Then** it's plain metrics/table only — no charts, no extra visual polish (UX-DR15)

### Story 4.2: Mint a new First-Gen Invite Key from the dashboard

As Tony,
I want to mint a new First-Gen Invite Key on demand,
So that I can invite a friend directly or grant an approved access request.

**Acceptance Criteria:**

**Given** Tony is on the Admin Dashboard
**When** he triggers "Mint Key"
**Then** a new, valid, unredeemed First-Gen InviteKey is created, with no generation/eligibility restriction — a separate admin-only path from Story 1.2's onward-key mechanism (AD-17)

**Given** a non-admin Account
**When** they attempt to call the mint mutation directly
**Then** it's rejected server-side via the admin-group check (AD-9)

**Given** key minting fails for any reason
**When** the failure occurs
**Then** Tony sees a clear inline error and the action remains available to retry

### Story 4.3: Adjust the Daily Limit and Monthly Budget without a deploy

As Tony,
I want to edit the daily request limit and monthly budget ceiling from the dashboard,
So that I can tune cost controls without touching code.

**Acceptance Criteria:**

**Given** Tony is on the Admin Dashboard
**When** he edits the daily limit or monthly budget field and saves
**Then** the Config item's values update, and the next Orientation Guide request reads the new values (AD-13)

**Given** a non-admin Account
**When** they look for this field
**Then** it's not exposed anywhere in their UI

**Given** a request is already in flight when Config is edited
**When** that request completes
**Then** it uses whichever Config snapshot it read at the start — not a value read mid-flight (AD-13 single-snapshot rule)

### Story 4.4: Revoke an Invite Key

*(No PRD FR number — FR1's own AC tests against a "revoked" key existing, but nothing in the original document built the capability that creates that state.)*

As Tony,
I want to revoke an Invite Key,
So that I can shut down a key that's been abused, leaked, or issued by mistake before it's redeemed.

**Acceptance Criteria:**

**Given** Tony is on the Admin Dashboard and selects an unredeemed Invite Key
**When** he revokes it
**Then** its status changes to revoked and it can never be redeemed

**Given** a key that's already been redeemed
**When** Tony looks for a way to revoke it
**Then** the action is unavailable — revocation only applies to still-unredeemed keys

**Given** a revoked key
**When** someone attempts to redeem it
**Then** they see "This key was revoked" (Story 1.1) and no Account is created

**Given** a non-admin Account
**When** they attempt to call the revoke mutation directly
**Then** it's rejected server-side via the admin-group check (AD-9)
