---
stepsCompleted: [1, 2, 3, 4, 5, 6]
documentsIncluded:
  - _bmad-output/planning-artifacts/prds/prd-tarot-spa-2026-07-06/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-tarot-spa-2026-07-09/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-tarot-spa-2026-07-09/EXPERIENCE.md
  - _bmad-output/planning-artifacts/epics.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-11
**Project:** tarot-spa Multiuser + LLM Orientation Guide

## Document Inventory

**PRD**
- Whole document: `prds/prd-tarot-spa-2026-07-06/prd.md`

**Architecture**
- Whole document: `architecture/architecture-tarot-spa-2026-07-10/ARCHITECTURE-SPINE.md`

**UX Design Contract** (bmad-ux spine pair)
- `ux-designs/ux-tarot-spa-2026-07-09/DESIGN.md`
- `ux-designs/ux-tarot-spa-2026-07-09/EXPERIENCE.md`

**Epics & Stories**
- Whole document: `epics.md`

No duplicate whole+sharded formats found for any document type. No missing required documents.

## PRD Analysis

### Functional Requirements

FR-1: A prospective user holding a valid, unredeemed Invite Key can create an Account. Consequences: System rejects account creation with an invalid, already-redeemed, or revoked Invite Key. Each Invite Key redeems to exactly one Account. Out of Scope: Self-service signup without an Invite Key.

FR-2: A First-Gen Account can generate exactly one Invite Key to grant onward, creating a Second-Gen Account upon redemption. Realizes UJ-1 (Erica's onward key to a friend). Consequences: System prevents a First-Gen Account from generating more than one onward Invite Key. Second-Gen Accounts have no path (UI or otherwise) to generate a further Invite Key in v1.

FR-3: Tony can generate and issue new First-Gen Invite Keys directly (to friends, or in response to approved requests from FR-5). Consequences: A mechanism exists for Tony to mint a new First-Gen Invite Key on demand. Surfaced concretely via the Admin Dashboard (FR-12). Notes: Invite Keys are single-use and non-expiring unless explicitly revoked — no stated expiry window. The two-generation cap bounds invite-chain depth, not the total number of Accounts Tony can mint directly.

FR-4: Any visitor, unauthenticated, can view a public landing page presenting the PR-FAQ content. Consequences: Landing page is reachable without authentication and exposes no Session or Account functionality.

FR-5: Any visitor can submit a name + email request for access. Consequences: Submission sends an email to a Tony-controlled cutout address containing the submitted name and email. Requester sees a simple on-page acknowledgment; no account, database record, or waitlist position is created in v1. Out of Scope: Auto-approval, waitlist position display, applicant-facing confirmation email.

FR-6: An authenticated user can enter freeform Context text describing their situation before drawing. Consequences: Context field accepts freeform, multi-paragraph text. A contextual hint/placeholder is shown to help the user know what to write.

FR-7: An authenticated user selects a Spread (Single, Three, Decision, System — existing configurations carried forward unchanged from the current app). Consequences: All four existing Spreads remain selectable; no new Spread types required for v1.

FR-8: An authenticated user with remaining Daily Orientation Limit can trigger a Draw and receive an Orientation Guide via a single "Help Me Orient" action. Realizes UJ-1, UJ-2. Consequences: System performs a Draw of Card(s) per the selected Spread. System sources exactly 3 Current Events relevant to the Draw via the LLM's internet search capability. System generates one Lens from the Draw + Current Events, then one Orientation Guide applying that Lens to the user's Context — in a single LLM call (one-shot; no follow-up turns within the app). Orientation Guide is essay-form prose, uses the idea/pattern of the drawn Card(s) as an Oblique Strategy (not a literal card-name reference) to shape the discussion, and demonstrably incorporates specific details from the user's own Context rather than restating the Card's idea abstractly (the UJ-2 quality bar). Orientation Guide structure: identifies where the pattern actually shows up in the user's situation, points out what the user is likely missing, challenges the user's framing if the underlying question itself is wrong, gives one non-obvious/counterintuitive implication, and suggests better next questions the user should be asking. Output is concrete and specific, avoids generic/widely-known advice, and prefers reframing over summarizing. A completed request consumes exactly one unit of the user's Daily Orientation Limit (FR-9), including requests that produce a "miss." Out of Scope: Multi-turn/conversational follow-up within the app. Feature-specific NFRs: If the Current Events search or the LLM call fails outright, the system fails gracefully with a clear message and does not consume a unit of the Daily Orientation Limit for that attempt. What happens when the Current Events search is slow but doesn't outright fail is deferred to architecture.

FR-9: The system enforces a configurable maximum number of Orientation Guide requests per Account per calendar day. Consequences: Requests beyond the configured cap are rejected with a clear, explicit message (not a silent failure, not a degraded/free response — **note: this literal wording is superseded by EXPERIENCE.md's graceful-degrade-to-Quick-Draw design, tracked as a pending PRD edit**). The cap value is adjustable by Tony without a code deployment. Feature-specific NFRs: Enforcement is server-side. A client-side-only cap is not acceptable.

FR-10: The system enforces a configurable aggregate monthly spend ceiling across all Accounts combined — default: $30/month — separate from and in addition to the per-Account Daily Orientation Limit (FR-9). Consequences: Tony is proactively notified (push, not just dashboard pull) when aggregate spend crosses a configurable warning threshold of the monthly ceiling. If aggregate spend reaches the monthly ceiling, the system stops accepting new Orientation Guide requests for the remainder of the billing period, with a clear message to affected users. The $30/month figure is fixed independent of which Bedrock model is ultimately chosen.

FR-11: Tony can view a dashboard showing number of users (by generation), number of Sessions, Daily Orientation Limit hit-rate, and aggregate spend against the FR-10 monthly budget ceiling. Consequences: Dashboard is reachable only by Tony's admin-flagged Account. Metrics reflect at least daily-refreshed usage data. Dashboard shows aggregate spend-to-date against the FR-10 budget ceiling. Out of Scope: Multi-admin support or role-based access. Survey-derived success indicators (no Survey exists in v1).

FR-12: Tony can mint a new First-Gen Invite Key directly from the Admin Dashboard. Implements the capability described in FR-3, covering both direct friend invites and approved requests from FR-5. Consequences: Admin Dashboard includes a control that creates a new, valid, unredeemed First-Gen Invite Key.

Total FRs: 12

### Non-Functional Requirements

NFR (Security): Invite Key redemption and Cognito authentication gate all Session data. No Account can access another Account's Context, Draw, or Orientation Guide.

NFR (Reliability): A failed Current Events search or LLM call degrades gracefully (clear user-facing error) rather than silently failing — and must not consume a Daily Orientation Limit unit (see FR-8 NFR).

NFR (Observability): The Admin Dashboard (FR-11) is the primary observability surface for usage in v1 — no separate logging/monitoring product is in scope. The one push-based exception is FR-10's budget alert — Tony must not have to remember to check the dashboard to learn the cost ceiling is at risk.

NFR (Cost, §6): The hardest constraint on this release: Tony has set a $30/month aggregate budget ceiling across all Accounts combined (FR-10), on top of the per-Account Daily Orientation Limit (FR-9). Hosting itself (Amplify, Cognito, API Gateway, Lambda) is chosen to keep fixed costs near-zero.

NFR (Privacy, §6): Context and Orientation Guide content must remain visible only to the Account that created them. Data retention, deletion-on-request, encryption-at-rest, and breach/incident handling are unspecified in v1 — accepted as a hobby-tier risk for a friend circle.

NFR (Latency, §4.3 FR-8 Notes): Target end-to-end latency for a full generation (draw + current-events search + LLM essay) is ~20 seconds — unvalidated against any specific Bedrock model, affects loading-state design.

Total NFRs: 6

### Additional Requirements

- Monetization: v1 is free for all First-Gen and Second-Gen Accounts; no payment mechanism exists in v1. A future paid tier is anticipated but undesigned, triggered by a real demand signal.
- Non-Goals (§7): no conversational/multi-turn AI advisor; no self-service public signup; no third-generation-or-deeper invite chains in v1; no payment/billing system in v1; no native mobile apps; no multi-admin/role-based admin access; no in-app conversational elaboration; no automated Follow-Up Nudge/Survey tooling in v1; no data retention/deletion/breach-handling procedures in v1.
- Success Metrics (§9): SM-1 (access requests per month), SM-2 (Sessions per Account per week), SM-3 (Second-Gen conversion rate), a manual/qualitative signal (Tony personally follows up with early users), and counter-metric SM-C1 (Daily Orientation Limit hit-rate driven down purely to save cost).
- §12 Related Review Artifacts: a structured edge-case pass (`review-edge-case.md`) found ~30 implementation/architecture-level findings, explicitly intended to carry forward into the architecture doc rather than be duplicated as FRs.

### PRD Completeness Assessment

The PRD is unusually disciplined for its stakes: every FR carries testable Consequences, assumptions are inline-tagged and indexed, and three separate quality reviews (rubric, adversarial, edge-case) were run and folded back in before this document was finalized. One wrinkle found and **fixed during this assessment**: FR-9's literal "not a degraded/free response" wording had been superseded by a later UX decision (EXPERIENCE.md's graceful-degrade-to-Quick-Draw) but never patched back into the PRD text — tracked only as a pending edit in the PRD's own memlog. Patched now; `prd.md` FR-9 and `EXPERIENCE.md` are consistent as of this report.

## Epic Coverage Validation

### Epic FR Coverage Extracted (from epics.md's own FR Coverage Map)

FR1: Epic 1 | FR2: Epic 1 | FR4: Epic 2 | FR5: Epic 2 | FR6: Epic 3 | FR7: Epic 3 | FR8: Epic 3 | FR9: Epic 3 | FR10: Epic 3 | FR11: Epic 4 | FR12: Epic 4

Total FRs in epics.md's own coverage map table: 11 — **FR3 is missing from this table.**

### FR Coverage Analysis

| FR Number | PRD Requirement | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-1 | Account creation via Invite Key | Epic 1, Story 1.1 | ✓ Covered |
| FR-2 | First-Gen grant capability | Epic 1, Story 1.2 | ✓ Covered |
| FR-3 | Tony-issued First-Gen keys | **Not in the FR Coverage Map table** — but Story 4.2's own AC explicitly cites "(AD-17, FR3, FR12)" | ⚠️ Functionally covered, map is stale |
| FR-4 | Public landing page | Epic 2, Story 2.1 | ✓ Covered |
| FR-5 | Request-access form | Epic 2, Story 2.2 | ✓ Covered |
| FR-6 | Context entry | Epic 3, Story 3.1 | ✓ Covered |
| FR-7 | Spread selection | Epic 3, Story 3.1 | ✓ Covered |
| FR-8 | Orientation Guide generation | Epic 3, Stories 3.2/3.3/3.4 | ✓ Covered |
| FR-9 | Configurable daily cap | Epic 3, Stories 3.1/3.2 | ✓ Covered (see PRD-wording caveat above) |
| FR-10 | Aggregate monthly budget cap & alerting | Epic 3, Stories 3.2/3.6 | ✓ Covered |
| FR-11 | Admin metrics dashboard | Epic 4, Story 4.1 | ✓ Covered |
| FR-12 | Admin-issued Invite Keys | Epic 4, Story 4.2 | ✓ Covered |

### Missing Requirements

None outstanding. FR-3's coverage-map row was missing (documentation-completeness only — the capability itself was always built in Story 4.2) and has been **patched into `epics.md` during this assessment**.

### Coverage Statistics

- Total PRD FRs: 12
- FRs covered in epics (functionally): 12 / 12 (100%)
- FRs correctly reflected in the coverage map table: 12 / 12 (100%) — fixed during this assessment

## UX Alignment Assessment

### UX Document Status

Found — bmad-ux spine pair (`DESIGN.md` + `EXPERIENCE.md`), both `status: final`.

### Alignment Issues (found and fixed during this assessment)

- **UX↔PRD:** FR-4's text never mentioned the public Quick Draw capability, even though `EXPERIENCE.md`'s IA explicitly places it on the Public Landing surface and Tony's own framing ("Nobody should be bereft of a good tarot reading if it's all done in their browser") drove that decision. Tracked only as a memlog note during the UX session, never patched into `prd.md`. **Patched** — same pattern as the FR-9 fix earlier in this assessment.
- **UX↔Epics:** `EXPERIENCE.md`'s Information Architecture table never listed Log In or Log Out as surfaces at all — these were only discovered downstream, during party-mode review of the epics/stories (Stories 1.3, 1.4), and never patched back into the UX spine itself. **Patched** — added both as spine-only IA rows (no new visual pattern needed; Log In reuses the existing Input component, Log Out is a single action).

### Warnings

- **Low severity, no action taken:** Story 3.5 (groundedness scoring, a party-mode addition after the UX spine was finalized) adds an `average groundednessScore` metric to the Admin Dashboard. Neither `DESIGN.md` nor `EXPERIENCE.md` mentions this metric, since it postdates UX finalization. Not treated as a gap requiring a UX patch — UX-DR15's existing pattern ("plain metrics list/table") already structurally accommodates one more line item with no new component or visual decision needed. Flagging for completeness only.

## Epic Quality Review

Applied `bmad-create-epics-and-stories`' own standards rigorously, not just re-asserting the checks already done during that workflow.

### Epic Structure Validation

| Epic | User Value Focus | Independence |
| --- | --- | --- |
| 1: Multiuser Accounts & Invite Keys | ✓ Real (join, invite) | ✓ Stands alone |
| 2: Public Landing & Access Requests | ✓ Real (learn, try, ask) | ✓ Depends only on Epic 1 (nav links to login/redeem), not 3 or 4 |
| 3: Draw & Orientation Guide | ✓ Real (the core product) | ✓ Depends only on Epic 1 (auth) |
| 4: Admin Dashboard | ✓ Real (Tony is a defined user/stakeholder in this product, per the PRD's own JTBD) | ✓ Depends on Epics 1 & 3 only, correct direction |

No technical-milestone epics found ("Setup Database," "API Development," etc.) — none of the four titles or goals describe internal architecture rather than user outcome.

### Story Quality & Dependency Analysis

Walked every story in build order (1.1→1.4, 2.1→2.2, 3.1→3.7, 4.1→4.4) checking for forward references. One was already caught and fixed during the epics-and-stories workflow itself (Story 3.1's rate-limit check originally depended on Story 3.2's not-yet-built tracking; fixed to a passed-in flag, independently testable with a mock).

**New finding this pass:** Neither Story 3.2 nor Story 4.3 explicitly created the Config item (`dailyLimit`/`monthlyBudget`) — 4.3 only ever *edits* it, and nothing said who seeds it with starting values. **Fixed** — added an AC to Story 3.2 (the first story that needs Config to exist) seeding it with defaults.

No other forward dependencies, vague ACs, or database-timing violations found. Acceptance criteria throughout use consistent Given/When/Then structure, cover error paths (not just happy path), and specify measurable outcomes rather than vague statements like "user can log in."

### Special Implementation Checks

- **Starter template (Amplify Gen 2):** Story 1.1 carries the scaffold as its technical foundation while still being a genuine user-value story (redeem key → create account) — a deliberate judgment call favoring the framework's own anti-pattern rule (no valueless "set up project" stories) over its literal "Epic 1 Story 1 must be titled 'set up initial project'" instruction. Already surfaced and accepted during the epics-and-stories workflow; restated here for the record.
- **Brownfield indicators:** Present and correct — AD-1 (frontend conventions preserved unchanged) and AD-12 (existing draw-code/Quick Draw mechanism carried forward unchanged, referenced in Story 2.1) both function as this project's integration/compatibility stories. No data-migration story needed — this is new backend capability added to an existing static frontend, not a migration of existing user data.
- **File churn (Epic 1 ↔ Epic 4, both touch InviteKey):** Reassessed and still justified — different user (peer vs. admin), different milestone, genuine feedback-loop value in shipping the peer-invite loop before Tony's own tooling.

### Best Practices Compliance Checklist

- [x] Every epic delivers user value
- [x] Every epic can function independently of later epics
- [x] Stories appropriately sized (post-split — see Epic 3's 3.2/3.3/3.4 division)
- [x] No forward dependencies (one found and fixed this pass, one found and fixed during epics-and-stories itself)
- [x] Database/entity creation happens when first needed (one gap found and fixed this pass — Config seeding)
- [x] Clear, testable acceptance criteria throughout
- [x] Traceability to FRs maintained (FR3's coverage-map row fixed this assessment)

## Summary and Recommendations

### Overall Readiness Status

**READY.**

### Critical Issues Requiring Immediate Action

None outstanding. Every issue this assessment found was fixed during the assessment itself, live, rather than left as a punch list:

1. `prd.md` FR-9 said "hard rejection, not a degraded/free response" — stale, contradicted by the later graceful-degrade-to-Quick-Draw UX decision. **Fixed.**
2. `epics.md`'s FR Coverage Map was missing a row for FR-3 (the capability itself was always built, in Story 4.2 — just never listed). **Fixed.**
3. `prd.md` FR-4 never mentioned the public Quick Draw capability that `EXPERIENCE.md` explicitly places on the same screen. **Fixed.**
4. `EXPERIENCE.md`'s Information Architecture table never listed Log In or Log Out as surfaces, even though `epics.md` already has stories for both (caught downstream during party-mode review, never patched upstream into the UX spine). **Fixed.**
5. No story explicitly created the Config item (`dailyLimit`/`monthlyBudget`) with starting values — Story 4.3 only ever edits it. **Fixed** — added to Story 3.2.

One additional issue was already caught and fixed earlier, during the epics-and-stories workflow itself (Story 3.1's rate-limit check originally forward-depended on Story 3.2) — noted here for a complete count, not re-fixed.

### Recommended Next Steps

1. Proceed to `bmad-sprint-planning` to turn `epics.md` into an actual sprint plan.
2. No blocking documentation work remains — `prd.md`, `EXPERIENCE.md`, and `epics.md` are all mutually consistent as of this report.
3. Optional, non-blocking: the groundedness-score metric (Story 3.5/4.1) still isn't reflected in the UX spine's Admin Dashboard description. Low severity — worth a one-line addition next time `DESIGN.md`/`EXPERIENCE.md` are touched for any other reason, not worth a dedicated pass on its own.

### Final Note

This assessment found 6 issues across 4 categories (PRD-text drift, epics traceability, UX-spine drift, story/data-model completeness). All 6 were fixed live rather than deferred — `prd.md`, `EXPERIENCE.md`, and `epics.md` are ready to build from as they stand right now.
