---
title: 'tarot-spa Multiuser + LLM Orientation Guide'
status: draft
created: '2026-07-06'
updated: '2026-07-11'
---

# PRD: tarot-spa Multiuser + LLM Orientation Guide
*Working title — confirm.*

## 0. Document Purpose

This PRD defines the next release of tarot-spa: turning it from a solo static single-player app into a small multiuser product for Tony's friend circle, centered on a new LLM-generated Orientation Guide. It's written for Tony as PM/builder and for the downstream architecture and epics/stories work that follows it. Structure: Glossary-anchored vocabulary (§3), features grouped with Functional Requirements nested and globally numbered (§4), assumptions tagged inline with `[ASSUMPTION]` and indexed (§9). Implementation-leaning detail volunteered during discovery (AWS service choices, the literal LLM prompt template) lives in `addendum.md`, not duplicated here.

## 1. Vision

Most bad decisions aren't made because people lack information — they're made because people are oriented incorrectly before they decide.

tarot-spa already has a systems-thinking tarot deck built for exactly this. Today, using it as a decision aid is a manual ritual: Tony draws a few cards, reads what's actually happening in the world, hand-writes a systems-thinking "Lens," and applies it to a real decision by hand-pasting into an LLM. This release turns that ritual into a product. Each user draws their own Cards, Current Events are sourced live, and an LLM generates a personal Lens and applies it — in one shot — to the user's own Context, producing an Orientation Guide: an essay that reframes their situation through systems thinking. It is explicitly not advice, not a summary, and not a conversation — it exists to serve the *Orient* step of the OODA loop, on the theory that a different way of seeing a decision is more valuable than one more opinion.

This release also makes tarot-spa multiuser for the first time — a two-generation invite-key system starting with Tony's direct friends — while keeping real per-request LLM cost bounded by a configurable daily limit per user. The point of the limit isn't to restrict people; it's the specific mechanism that lets this stay free for everyone using it.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** help me actually decide something I've been stuck on, by seeing it from a different angle — not another pro/con list I could've made myself
- **Emotional:** give me an "oh" moment — a reframe, not an opinion or a recommendation
- **Social:** hand me something worth sharing afterward — a phrase, a line, a reframe I want to show someone else
- **Contextual (Tony's own JTBD as builder):** [ASSUMPTION] validate cheaply whether this idea has real legs — friends asking for keys unprompted is the signal — before investing further

### 2.2 Non-Users (v1)

- The general public — v1 is invite-only, two generations deep from Tony (see Glossary: Invite Key)
- Anyone wanting an interactive/conversational advisor — the Orientation Guide is one-shot by design; users who want back-and-forth elaboration are expected to continue the conversation in their own personal LLM, outside tarot-spa

### 2.3 Key User Journeys

- **UJ-1. Erica reorients on a promotion decision and shares the line that lands.**
  - **Persona + context:** Erica, a friend from Capital One, weighing her current role (which she loves) against a VP promotion carrying risk-ownership responsibilities. She's already built a real business case in her head — pros/cons, want-got gaps, management hints, her goals, work/life balance questions.
  - **Entry state:** Authenticated, holding a First-Gen Invite Key Tony sent her directly (with the ability to grant one Invite Key onward). She arrived pre-sold, having already read Tony's LinkedIn article and PR-FAQ.
  - **Path:** She types her full situation as one freeform block into Context. She selects the Decision Spread. She taps **"Help Me Orient."** The system Draws her Cards, sources 3 Current Events, and generates an essay-form Orientation Guide.
  - **Climax:** The guide lands on her Resources card and reframes the people she'd lead as *misplaced resources* — skills sitting on a resume instead of used daily. She pictures specific people (Bob, Jayden), a favorite song puts her in the right headspace, and she decides: take the VP job, because it lets people do what they love.
  - **Resolution:** She highlights the line *"You're making four-star lemonade because you've got the best lemons on the continent"* and shares it with her husband (via native browser copy/paste — no custom share feature).

- **UJ-2. Maya gets an abstract miss and decides on gut instead.**
  - **Persona + context:** Maya, not a systems-thinking person at all — an everyday decision (buy a car vs. keep Ubering). She writes rich, concrete, sensory detail: cost, flexibility, chats with drivers, a saved bumper sticker, missing oil-change and gas-station rituals.
  - **Entry state:** Authenticated, on the orient flow.
  - **Path:** She types her observations in, hits **"Help Me Orient."** The Draw surfaces a Major Arcana Card, The Compression. The Orientation Guide picks up the Card immediately but stays abstract — *"What's the minimum viable complexity?"* — without weaving in her actual bumper sticker, her actual drivers, her actual rituals.
  - **Climax (inverted):** It doesn't land. She makes a face, half-registers the reducibility question underneath it, but it reads as a brush-off. She opens Instagram and wanders off.
  - **Resolution:** She decides on gut alone — buys the more complex, luxury-laden car, arguably the opposite of what the Lens implied. Weeks later the phrase surfaces unbidden: *"What was it that card said... about complexity... is this car too complex?"* No in-app action taken; the guide's only effect was delayed and involuntary.
  - **Edge case:** [ASSUMPTION] A miss gets no special in-app recovery in v1 — a redraw costs another unit of the user's Daily Orientation Limit like any other request.

## 3. Glossary

- **Account** — a registered user, authenticated via Cognito. Holds exactly one Invite Key (the one used to join) and a generation status (First-Gen or Second-Gen).
- **Invite Key** — a credential that grants Account creation. Tony issues Invite Keys directly to his first circle of friends (First-Gen). Each First-Gen Account may grant exactly one Invite Key onward to a friend of their own, creating a Second-Gen Account. Second-Gen Accounts cannot grant further keys (v1).
- **Spread** — a named draw configuration (existing: Single, Three, Decision, System), each defining a fixed number of card positions. Canonical term — do not use "draw style" elsewhere in this document.
- **Card** — one entry from the systems-thinking tarot deck (existing deck data, carried forward unchanged), optionally inverted.
- **Draw** — the act of randomly selecting Cards for a Session according to the chosen Spread.
- **Oblique Strategy** — the function a drawn Card serves: a provocation meant to jolt a new angle of thought, not a fortune or prediction. Governs how a Card's idea must be *used*, not literally referenced, in the Orientation Guide.
- **Context** — the user's freeform account of their situation and observations, typed in ahead of a Draw.
- **Current Events** — real-world items (3, sourced via the LLM's own internet search) woven into the Lens to ground it in the present moment.
- **Lens** — the systems-thinking reframing pattern generated per-Session from the Draw + Current Events, expressed as an idea to view the Context through (not advice).
- **Orientation Guide** — the essay-form output delivered to the user: the Lens applied to their Context. The product's core deliverable.
- **Session** — one complete pass: Context entered, Spread chosen, Draw made, Orientation Guide produced.
- **Daily Orientation Limit** — a configurable per-Account cap on Orientation Guide requests per calendar day; the mechanism keeping the app cheap-as-free, paired with an aggregate monthly budget ceiling (see FR-10).
- **Follow-Up Nudge** — *(Post-MVP concept, deferred — see §8.2)* a planned automated re-engagement touchpoint after a Session. In v1, this happens informally instead: Tony personally contacts early users directly to ask what they decided.
- **Survey** — *(Post-MVP concept, deferred — see §8.2)* a planned structured response form for capturing decision outcomes at scale. Not built in v1 — Tony's direct contact with his friend circle serves the same purpose until usage outgrows what he can track by hand.
- **OODA Loop** — Observe-Orient-Decide-Act. The Orientation Guide exists to serve the *Orient* step specifically — this is why "advice" and "summary" are explicitly wrong outputs (see Oblique Strategy, Lens).

## 4. Features

### 4.1 Multiuser Accounts & Invite Keys

**Description:** tarot-spa moves from anonymous/local-only usage to authenticated Accounts, gated entirely by Invite Key. Growth is deliberately shallow: Tony issues First-Gen keys directly; each First-Gen Account can extend exactly one Second-Gen key onward. This caps viral spread at two generations until Tony decides otherwise.

**Functional Requirements:**

#### FR-1: Account creation via Invite Key

A prospective user holding a valid, unredeemed Invite Key can create an Account.

**Consequences (testable):**
- System rejects account creation with an invalid, already-redeemed, or revoked Invite Key.
- Each Invite Key redeems to exactly one Account.

**Out of Scope:**
- Self-service signup without an Invite Key (see §2.2 Non-Users, §4.2).

#### FR-2: First-Gen grant capability

A First-Gen Account can generate exactly one Invite Key to grant onward, creating a Second-Gen Account upon redemption. Realizes UJ-1 (Erica's onward key to a friend).

**Consequences (testable):**
- System prevents a First-Gen Account from generating more than one onward Invite Key.
- Second-Gen Accounts have no path (UI or otherwise) to generate a further Invite Key in v1.

#### FR-3: Tony-issued First-Gen keys

Tony can generate and issue new First-Gen Invite Keys directly (to friends, or in response to approved requests from FR-5).

**Consequences (testable):**
- A mechanism exists for Tony to mint a new First-Gen Invite Key on demand. Surfaced concretely via the Admin Dashboard (FR-12).

**Notes:**
- `[ASSUMPTION]` Invite Keys are single-use and non-expiring unless explicitly revoked — no stated expiry window.
- `[ASSUMPTION]` The two-generation cap bounds invite-chain *depth*, not the total number of Accounts Tony can mint directly — FR-3 has no stated ceiling on First-Gen keys. If demand is high, worst-case aggregate spend is actually bounded by FR-10's budget ceiling, not by chain depth alone.
- `[OPEN QUESTION]` Should Second-Gen Accounts ever gain onward-grant capability later, if usage grows? Deferred — not a v1 decision.

### 4.2 Public Landing Page & Access Requests

**Description:** Anyone without an Invite Key still needs a reason to want one and a way to ask for one. The existing PR-FAQ becomes a public landing page; a lightweight form lets visitors request access.

**Functional Requirements:**

#### FR-4: Public landing page

Any visitor, unauthenticated, can view a public landing page presenting the PR-FAQ content, and use the full Quick Draw capability (Spread selection, cards, Draw Again, load-a-draw-code — no Context, no LLM, no account required). Tony's framing: "Nobody should be bereft of a good tarot reading if it's all done in their browser."

**Consequences (testable):**
- Landing page is reachable without authentication and exposes no Session or Account functionality (Quick Draw itself is not a Session per the Glossary — no Context or Orientation Guide is involved).
- The full Quick Draw experience (identical to today's live v1.0 app) is available on this page without an Invite Key.

#### FR-5: Request-access form

Any visitor can submit a name + email request for access.

**Consequences (testable):**
- Submission sends an email to a Tony-controlled cutout address containing the submitted name and email.
- `[ASSUMPTION]` Requester sees a simple on-page acknowledgment; no account, database record, or waitlist position is created in v1 — the form is purely transactional.

**Out of Scope:**
- Auto-approval, waitlist position display, applicant-facing confirmation email.

**Notes:**
- `[NOTE FOR PM]` The cutout email is the entire intake mechanism by design — if the form is abused, the mitigation is to retire that address. This is deliberately disposable infrastructure, not a system to harden.
- `[ASSUMPTION]` No anti-abuse or duplicate-submission handling in v1 — accepted alongside the above, but it means the same person (or a bot, once the landing page is public) can inflate request counts. This directly affects how much weight SM-1 (§9) can bear as a demand signal.

### 4.3 Draw & Orientation Guide

**Description:** The core feature. An authenticated user describes their situation, picks a Spread, and triggers a one-shot LLM call that produces an Orientation Guide — grounded in their own words and shaped by systems-thinking Oblique Strategy from their drawn Card(s). Realizes UJ-1 and UJ-2 (the win and the miss).

**Functional Requirements:**

#### FR-6: Context entry

An authenticated user can enter freeform Context text describing their situation before drawing.

**Consequences (testable):**
- Context field accepts freeform, multi-paragraph text.
- `[ASSUMPTION]` A contextual hint/placeholder is shown to help the user know what to write. `[TO BE PROVIDED]` exact hint copy, including whether it varies by the type of orientation problem (e.g. differs by Spread) — Tony has ideas, held back for now; whether per-Spread variation ships in v1 or a single hint suffices is deferred to that same discussion (see addendum.md).

#### FR-7: Spread selection

An authenticated user selects a Spread (Single, Three, Decision, System — existing configurations carried forward unchanged from the current app).

**Consequences (testable):**
- All four existing Spreads remain selectable; no new Spread types required for v1.

#### FR-8: Orientation Guide generation ("Help Me Orient")

An authenticated user with remaining Daily Orientation Limit can trigger a Draw and receive an Orientation Guide via a single "Help Me Orient" action. Realizes UJ-1, UJ-2.

**Consequences (testable):**
- System performs a Draw of Card(s) per the selected Spread.
- System sources exactly 3 Current Events relevant to the Draw via the LLM's internet search capability.
- System generates one Lens from the Draw + Current Events, then one Orientation Guide applying that Lens to the user's Context — in a single LLM call (one-shot; no follow-up turns within the app).
- Orientation Guide is essay-form prose, uses the idea/pattern of the drawn Card(s) as an Oblique Strategy (not a literal card-name reference) to shape the discussion, and demonstrably incorporates specific details from the user's own Context rather than restating the Card's idea abstractly (the UJ-2 quality bar).
- Orientation Guide structure: identifies where the pattern actually shows up in the user's situation, points out what the user is likely missing, challenges the user's framing if the underlying question itself is wrong, gives one non-obvious/counterintuitive implication, and suggests better next questions the user should be asking.
- Output is concrete and specific, avoids generic/widely-known advice, and prefers reframing over summarizing.
- A completed request consumes exactly one unit of the user's Daily Orientation Limit (FR-9), including requests that produce a "miss."

**Out of Scope:**
- Multi-turn/conversational follow-up within the app. A user wanting further elaboration is expected to continue with their own personal LLM outside tarot-spa.

**Feature-specific NFRs:**
- If the Current Events search or the LLM call fails outright, the system fails gracefully with a clear message and does **not** consume a unit of the Daily Orientation Limit for that attempt.
- `[OPEN QUESTION]` What happens when the Current Events search is slow but doesn't outright fail (as opposed to the failure case above)? Does the system time out and proceed without grounding, or just run long? Deferred to architecture.

**Notes:**
- `[ASSUMPTION]` Target end-to-end latency for a full generation (draw + current-events search + LLM essay) is ~20 seconds — affects loading-state design, but is unvalidated against any specific Bedrock model. Revisit once a model is chosen and benchmarked (see addendum.md).
- `[NOTE FOR PM]` The "grounded vs. abstract" quality bar surfaced by UJ-2 is a prompt-design problem more than a spec-able requirement — expect iteration post-launch rather than a one-time fix. That said, before launch it's worth assembling a small held-out set of Context examples (one Erica-style/grounded, one Maya-style/abstract-miss-prone) with an explicit human pass/fail rubric, so this requirement has *something* concrete to test against pre-launch rather than waiting entirely on post-launch signal.

### 4.4 Daily Orientation Limit & Cost Controls

**Description:** The mechanism that keeps real per-request LLM cost bounded, so the app can stay free. This is a hard constraint on §4.3, not an optional nicety. Two layers: a per-Account daily cap (FR-9) and an aggregate monthly budget ceiling (FR-10) — the daily cap alone doesn't bound total spend, since the number of Accounts is otherwise uncapped (see §4.1 FR-3 note).

**Functional Requirements:**

#### FR-9: Configurable daily cap

The system enforces a configurable maximum number of Orientation Guide requests per Account per calendar day.

**Consequences (testable):**
- Requests beyond the configured cap gracefully degrade to the free, unlimited Quick Draw experience with a short playful inline note, rather than a hard rejection message — the entire Context Entry screen becomes Quick Draw for the remainder of the calendar day (see EXPERIENCE.md's Rate-Limited Intake state; this supersedes an earlier draft's "hard rejection, not a degraded/free response" wording, now reconciled here).
- `[ASSUMPTION]` The cap value is adjustable by Tony without a code deployment.

**Feature-specific NFRs:**
- Enforcement is server-side. A client-side-only cap is not acceptable, since the entire point is bounding real infrastructure spend.

#### FR-10: Aggregate monthly budget cap & alerting

The system enforces a configurable aggregate monthly spend ceiling across all Accounts combined — **default: $30/month** — separate from and in addition to the per-Account Daily Orientation Limit (FR-9).

**Consequences (testable):**
- Tony is proactively notified (push, not just dashboard pull — e.g. email/SMS alert) when aggregate spend crosses a configurable warning threshold (e.g. 80%) of the monthly ceiling.
- If aggregate spend reaches the monthly ceiling, the system stops accepting new Orientation Guide requests for the remainder of the billing period (or throttles to a reduced global rate), with a clear message to affected users.
- The $30/month figure is fixed independent of which Bedrock model is ultimately chosen. Once a model is selected and real per-request cost is known, Tony tunes the Daily Orientation Limit (FR-9) — and, if necessary, the model choice itself — to hold real spend under this ceiling.

**Notes:**
- `[ASSUMPTION]` "One Orientation Guide request = one billable LLM interaction" may undercount real cost if the Current Events search step requires multiple underlying model invocations (e.g. agentic tool-use/search patterns). The $30/month ceiling is the fixed constraint regardless; Daily Orientation Limit and/or model choice are the tuning knobs used to stay under it.
- Total exposure also scales with total Account count, which FR-9 alone doesn't bound (Tony can mint First-Gen keys freely — FR-3, FR-12). This FR is what actually bounds worst-case aggregate spend.

### 4.5 Admin Dashboard

**Description:** Tony-only operational visibility into usage, cost, and early qualitative signal — the closest thing this product has to a business dashboard.

**Functional Requirements:**

#### FR-11: Admin metrics dashboard

Tony can view a dashboard showing number of users (by generation), number of Sessions, Daily Orientation Limit hit-rate, and aggregate spend against the FR-10 monthly budget ceiling.

**Consequences (testable):**
- Dashboard is reachable only by Tony's admin-flagged Account.
- Metrics reflect at least daily-refreshed usage data.
- Dashboard shows aggregate spend-to-date against the FR-10 budget ceiling (in addition to the push alert FR-10 already requires).

**Out of Scope:**
- Multi-admin support or role-based access — v1 is Tony-only.
- Survey-derived success indicators — no Survey exists in v1 (see §8.2). Add this once the Survey ships.

#### FR-12: Admin-issued Invite Keys

Tony can mint a new First-Gen Invite Key directly from the Admin Dashboard. Implements the capability described in FR-3, covering both direct friend invites and approved requests from FR-5.

**Consequences (testable):**
- Admin Dashboard includes a control that creates a new, valid, unredeemed First-Gen Invite Key.

**Notes:**
- `[ASSUMPTION]` No formal audit trail links a minted key back to a specific FR-5 request — at friend-circle scale, Tony tracks this informally (memory, or checking his own cutout inbox). Revisit if request volume grows beyond what he can track this way.

## 5. Cross-Cutting NFRs

- **Security:** Invite Key redemption and Cognito authentication gate all Session data. No Account can access another Account's Context, Draw, or Orientation Guide.
- **Reliability:** A failed Current Events search or LLM call degrades gracefully (clear user-facing error) rather than silently failing — and must not consume a Daily Orientation Limit unit (see FR-8 NFR).
- **Observability:** The Admin Dashboard (FR-11) is the primary observability surface for usage in v1 — no separate logging/monitoring product is in scope. The one push-based exception is FR-10's budget alert: Tony must not have to remember to check the dashboard to learn the cost ceiling is at risk.

## 6. Constraints and Guardrails

**Cost**
The hardest constraint on this release, and now a real number: Tony has set a **$30/month** aggregate budget ceiling across all Accounts combined (FR-10), on top of the per-Account Daily Orientation Limit (FR-9) which bounds individual usage but not total spend. Hosting itself (Amplify, Cognito, API Gateway, Lambda) is chosen to keep fixed costs near-zero, leaving Bedrock + internet-search usage as the only real variable cost — tuned to stay under the $30/month ceiling via FR-9 and FR-10 together. `[OPEN QUESTION]` Exact per-request cost is unknown until a specific Bedrock model is chosen (see addendum.md) — the $30/month ceiling is fixed regardless; the Daily Orientation Limit value and/or the model choice are what get tuned once real cost is known.

**Privacy**
Context frequently contains sensitive personal, career, or relationship information (see UJ-1, UJ-2). Context and Orientation Guide content must remain visible only to the Account that created them. `[OPEN QUESTION]` Does Tony need raw-content access for debugging/quality iteration on the prompt, or should the Admin Dashboard stay strictly aggregate/anonymized? `[ASSUMPTION]` Data retention, deletion-on-request, encryption-at-rest, and breach/incident handling are unspecified in v1 — accepted as a hobby-tier risk for a friend circle, but should be revisited before any broader/public opening (see §7, §8.2).

**Monetization**
v1 is free for all First-Gen and Second-Gen Accounts; no payment mechanism exists in v1. `[ASSUMPTION]` A future paid tier is anticipated but undesigned, triggered by a real demand signal (people requesting First-Gen keys unprompted — see §2.1 JTBD) rather than being a v1 requirement.

## 7. Non-Goals (Explicit)

- Not building a conversational, multi-turn AI advisor — the Orientation Guide is one-shot by design.
- Not building self-service public signup — access is invite-only, two generations deep, in v1.
- Not building third-generation-or-deeper invite chains in v1.
- Not building any payment or billing system in v1.
- Not building native mobile apps — web only, responsive (carrying forward the app's existing Tailwind responsive layout).
- Not building multi-admin or role-based admin access — Tony is the sole admin in v1.
- Not building in-app conversational elaboration on an Orientation Guide — users wanting more depth are expected to continue in their own personal LLM.
- Not building automated Follow-Up Nudge emails or a Survey tool in v1 — at friend-circle scale, Tony gets this signal by contacting people directly; automate only once usage moves beyond people he can personally check in with.
- Not building data retention/deletion controls, breach handling, or backup/incident-response procedures in v1 — accepted risk at friend-circle/hobby scale; revisit before any broader opening.

## 8. MVP Scope

### 8.1 In Scope
- Cognito-backed Accounts with two-generation Invite Key system (FR-1, FR-2, FR-3)
- Public PR-FAQ landing page + cutout-email request form (FR-4, FR-5)
- Full Draw & Orientation Guide flow: Context, Spread, Draw, Current Events, Lens, essay-form output (FR-6 – FR-8)
- Configurable, server-enforced Daily Orientation Limit + aggregate $30/month budget cap with alerting (FR-9, FR-10)
- Admin Dashboard: usage/spend metrics + Invite Key minting (FR-11, FR-12)

### 8.2 Out of Scope for MVP
- Third-generation+ invite chains — deferred, revisit if Second-Gen accounts prove highly active.
- Paid tier / billing — deferred until the demand signal in §2.1 JTBD actually shows up. `[NOTE FOR PM]` This is the whole point of the exercise for Tony personally — worth a real revisit the moment invite requests start outpacing supply, not just a someday-maybe.
- Waitlist position display / applicant-facing confirmation emails for access requests.
- Native mobile apps.
- Multi-admin / role-based access.
- In-app conversational elaboration beyond the one-shot Orientation Guide.
- Automated Follow-Up Nudge email + Survey tooling — deferred until broader (non-friend-circle) consumption. Tony follows up with early users directly and informally in v1 (see Glossary: Follow-Up Nudge, Survey).
- Data retention/deletion controls, encryption-at-rest requirements, and breach/incident-response procedures — accepted hobby-tier risk, revisit before any broader opening (see §6 Privacy).

## 9. Success Metrics

**Primary**
- **SM-1:** Access requests via the public form (FR-5) per month — the demand signal validating whether this idea has real legs. Validates FR-5, §2.1 JTBD. `[ASSUMPTION]` This count doesn't distinguish organic requests from people Tony personally pitched (LinkedIn article, direct friend asks) or from duplicate submissions (FR-5 has no dedup) — read as a directional signal, not a clean number, unless/until dedup and source-tagging are added.
- **SM-2:** Sessions per Account per week (repeat usage).
- **SM-3:** Second-Gen conversion rate — % of First-Gen Accounts that redeem their one onward Invite Key. Validates FR-2.

**Qualitative signal (v1, manual — not tooled)**
- Tony personally follows up with early users to learn what they decided and whether the Orientation Guide actually helped — the same signal a Survey would eventually capture, gathered informally instead of automated. `[NOTE FOR PM]` Revisit once usage outgrows what Tony can track this way — that outgrowing is itself the trigger to build the automated Follow-Up Nudge + Survey (§8.2).

**Counter-metrics (do not optimize)**
- **SM-C1:** Daily Orientation Limit hit-rate driven down purely to save cost. Counterbalances FR-9/FR-10 — the Limit and budget cap exist to bound cost, not to become a silent way of degrading the product.

## 10. Open Questions

1. Exact contextual hint/placeholder copy for the Context input box (FR-6), including whether it varies by Spread — deferred by Tony (see addendum.md).
2. Does Tony need raw Context/Orientation Guide access for prompt quality iteration, or should the Admin Dashboard stay strictly aggregate (§6 Privacy)?
3. Concrete mechanism for Tony to adjust the Daily Orientation Limit value (FR-9) — capability is required, exact interface undecided.
4. Should Second-Gen Accounts ever gain onward-grant capability if usage grows (FR-2)? Not a v1 decision.
5. What happens when Current Events search is slow but doesn't outright fail (FR-8)? Timeout-and-proceed-without-grounding vs. just running long — deferred to architecture.

## 11. Assumptions Index

- §2.1 — Tony's own JTBD as builder framed as validating the idea cheaply, with unprompted key requests as the signal.
- §2.3 UJ-2 — No special in-app "miss" recovery in v1; a redraw simply costs another Daily Orientation Limit unit.
- §4.1 FR-1 — Invite Keys are single-use and non-expiring unless explicitly revoked.
- §4.1 FR-3 — The two-generation cap bounds invite-chain depth, not the total number of Accounts Tony can mint directly; aggregate spend is actually bounded by FR-10's budget ceiling, not by chain depth.
- §4.2 FR-5 — Request-access form is purely transactional (email only); no persistence, no waitlist position, simple on-page acknowledgment only; no anti-abuse/dedup, so SM-1 volume can be inflated (accepted risk).
- §4.3 FR-6 — A contextual hint is shown in the Context box; exact copy, and whether it varies by Spread, deferred (see Open Question 1).
- §4.3 FR-8 — Target end-to-end latency (~20s) is unvalidated against any specific Bedrock model.
- §4.4 FR-9 — Daily Orientation Limit is configurable without a code deployment; exact admin interface deferred (see Open Question 3).
- §4.4 FR-10 — "One request = one billable LLM call" may undercount real cost if Current Events search requires multiple underlying invocations; the $30/month ceiling is fixed regardless, Daily Orientation Limit and/or model choice are the tuning knobs.
- §4.5 FR-12 — No formal audit trail links a minted key to a specific FR-5 request; tracked informally by Tony at this scale.
- §6 Privacy — Data retention, deletion-on-request, encryption-at-rest, and breach/incident handling are unspecified in v1; accepted hobby-tier risk.
- §6 Monetization — A future paid tier is anticipated but undesigned, gated on a real demand signal.
- §9 SM-1 — Access-request count doesn't distinguish organic demand from Tony's own promotional push or duplicate submissions; directional signal only.

## 12. Related Review Artifacts

A structured edge-case pass was run against this draft separately — see `review-edge-case.md` in this folder (concurrency on key redemption, partial-write failures between Cognito and the key store, duplicate-account rate-limit bypass, and 30 similar findings). Those are implementation/architecture-level and are intended to carry forward into the architecture doc rather than be duplicated here as FRs. `review-adversarial-general.md` and `review-rubric.md` cover the PM-level gaps that this revision folds in directly above.
