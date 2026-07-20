# Sprint Change Proposal — Durable Orientation Guide Execution

**Date:** 2026-07-19
**Project:** tarot-spa
**Trigger:** Stories 3.2 and 3.3
**Change scope:** Epic 3 architecture correction
**Scope classification:** Moderate — backlog reorganization plus coordinated Product Owner/Developer execution
**Selected path:** Direct adjustment through new Story 3.8
**Proposal approval:** Approved by Tony on 2026-07-19

## 1. Identified Issue

Story 3.2 implemented Orientation Guide generation as one synchronous AppSync-to-Lambda request containing reservation, Draw, Tavily, Bedrock, persistence, and the full response. Live verification measured successful generations at approximately 30.6–30.7 seconds, beyond AppSync's synchronous response boundary. The Lambda continued running and persisted the paid Session, but the browser received an error.

Story 3.3 compensated by treating that error as the normal path: it records the user's newest-Session baseline, polls all owner-readable Sessions, and assumes a newer Session is the one just requested.

That workaround makes a successful paid operation appear failed at the API boundary and makes the client infer execution identity from record ordering. Concurrent tabs, retries, or another completed Session can make that inference ambiguous. It also couples future redraw, groundedness, and metrics work to a known temporary design.

### Evidence

- Two live full generations completed in approximately 30.748 and 30.638 seconds.
- Both crossed AppSync's response boundary while the Lambda continued and persisted a Session.
- Story 3.3 consequently added baseline/newest-Session polling with a 75-second recovery deadline.
- The installed Amplify backend exposes `durableConfig`, so Lambda Durable Functions are available through the project's existing infrastructure path.

### Problem Statement

The product performs durable, paid, multi-step work behind a synchronous API contract. A successful execution can therefore be reported as an error, while the browser has no stable execution identity and must infer completion from the user's newest Session. The monolithic handler also lacks durable step checkpoints and explicit lifecycle visibility.

## 2. Approved Direction

Use a short-lived AppSync starter Lambda and a version-pinned Lambda Durable Functions worker:

```text
Browser
  │ startOrientationGuide(requestId, context, spreadKey)
  ▼
AppSync
  ▼
Starter Lambda
  ├── authenticate and validate
  ├── conditionally create Session(PENDING)
  ├── asynchronously invoke the durable worker
  └── return { sessionId, status }

Durable worker
  ├── Session → RUNNING
  ├── read one Config snapshot
  ├── atomically reserve usage and spend
  ├── Draw
  ├── Tavily
  ├── Bedrock
  ├── persist result
  └── Session → SUCCEEDED
       or compensate → FAILED

Browser
  └── poll only Session.get(sessionId)
```

The client request ID, Session ID, and durable execution name are the same UUID. Reusing the same ID and identical inputs returns the same execution. Reusing it with different inputs returns `IDEMPOTENCY_CONFLICT`.

Step Functions remains a valid future choice if the workflow expands into broad cross-service orchestration. It is not selected for this correction because the current workflow remains tightly coupled application logic and Amplify already supports code-first durable Lambda configuration.

## 3. Epic Impact

Epic 3 remains viable and retains its product outcome. No new epic is needed, and no completed story is rolled back.

Add **Story 3.8: Make Orientation Guide generation durable and asynchronous**. The identifier preserves existing Story 3.4–3.7 references, but Story 3.8 is the immediate execution priority and gates Stories 3.4 and 3.5.

### Remaining-Story Impact

- **Story 3.3:** Preserve its Results UI, loading/error treatment, accessibility, and rendering. Freeze review and supersede only its newest-Session recovery architecture.
- **Story 3.4:** Retain behavior; redraw submissions use the new asynchronous start contract.
- **Story 3.5:** Trigger groundedness judging only when a Session transitions to `SUCCEEDED`, never on initial `PENDING` creation or `FAILED`.
- **Story 3.6:** No product change; durable retries must not double-reserve spend.
- **Story 3.7:** Unaffected.
- **Story 4.1:** Count `SUCCEEDED` Sessions as delivered Guides; do not inflate metrics with `PENDING` or `FAILED` attempts.
- **Stories 4.2–4.4:** Unaffected.

## 4. Artifact Adjustments

### PRD

- Redefine Session as an Orientation Guide attempt with `PENDING`, `RUNNING`, `SUCCEEDED`, and `FAILED` lifecycle states.
- Clarify that one-shot means one deliberate submission and one LLM turn, not one synchronous HTTP request.
- Require prompt acknowledgment with a stable Session ID, exact execution tracking, and idempotent duplicate handling.
- Separate the prompt acknowledgment target (≤3 seconds) from measured full-generation latency (currently approximately 30.6–30.7 seconds).
- Define Session and usage metrics in terms of `SUCCEEDED` Sessions.

### PRD Addendum

- Replace the obsolete API Gateway direction with Amplify AppSync → starter Lambda → durable worker.
- Record why Lambda Durable Functions are selected for this increment and when Step Functions should be reconsidered.

### Architecture Spine

- Revise the one-Lambda-per-capability paradigm to permit a thin synchronous adapter plus one durable worker for long-running capabilities.
- Add the starter/worker path to the architecture diagrams.
- Amend AD-3 through AD-6, AD-8 through AD-11, AD-13, AD-14, and AD-18 for durable execution, grants, lifecycle data, replay-safe transactions, deployment versioning, and completed-Session metrics.
- Add AD-19 for durable asynchronous Orientation Guide execution.
- Give the starter only Session create/read/update and qualified worker-invoke permissions.
- Give the worker Session read/update, Config read, counter read/write, Bedrock, and Tavily-secret permissions.
- Derive deterministic reservation and compensation tokens from Session ID.
- Invoke a numbered worker version or controlled alias so deployments cannot change code beneath active executions.
- Pass only Session ID to the worker; load Context and Spread from DynamoDB.
- Keep Context, Tavily evidence, prompts, and Guide bodies out of CloudWatch logs and use short durable-history retention.

### Data and API Contracts

Replace the synchronous result contract with:

```text
startOrientationGuide(requestId, context, spreadKey)
  → { sessionId, status: PENDING }

Session.get(sessionId)
  → PENDING | RUNNING | SUCCEEDED | FAILED
```

Extend Session with:

- `status`
- `errorCode`
- `completedAt`
- optional result fields until `SUCCEEDED`

Existing Session records must be backfilled or unambiguously treated as `SUCCEEDED`.

### UX

- Preserve the existing loading, error, rate-limit, and Results visuals.
- Follow only the exact Session ID returned by the starter.
- Persist only the active Session ID for reload/restart recovery.
- On an ambiguous start response, query the already-known request/Session ID before allowing another submission.
- Clear the active ID on sign-out or deliberate exit from Results.
- Announce only meaningful lifecycle changes through existing status and alert regions.
- Remove baseline/newest-Session inference.
- Retain no arbitrary Session-history browsing surface.

### Implementation Records

- Append a dated supersession note to Story 3.2. Preserve its completed status, provider logic, reservation protocol, and evidence; supersede its synchronous invocation contract.
- Append a dated freeze note to Story 3.3. Preserve its UI work and evidence; prohibit further hardening of newest-Session polling.
- Keep Story 3.3 in `review` until Story 3.8 and the retained UI receive an integrated review.

### Project Context

Replace its obsolete static-only/no-backend/no-tests guidance with the current Amplify, AppSync, DynamoDB, Lambda, Vitest, Playwright, secrets, and durable-execution rules.

### Sprint Status

Add:

```yaml
3-8-make-orientation-guide-generation-durable-and-asynchronous: backlog
```

Place it immediately after Story 3.3 with a comment that it executes before Stories 3.4–3.7. Do not change existing story statuses.

## 5. Story 3.8 Acceptance Kernel

1. A valid submission conditionally creates an owner-readable `PENDING` Session and returns its ID promptly.
2. Duplicate identical starts return the existing Session and create no duplicate execution; conflicting reuse returns `IDEMPOTENCY_CONFLICT`.
3. The qualified durable worker transitions through `RUNNING` to exactly one terminal state.
4. The worker checkpoints one Config snapshot, reservation, Draw, Tavily, Bedrock, persistence, and compensation boundaries.
5. A compensable failure before a successful Bedrock result is checkpointed compensates exactly once before `FAILED`.
6. After a successful Bedrock result is checkpointed, persistence retries resume from that checkpoint and the reservation remains because real provider spend occurred; exhausted persistence retries raise an operational alert rather than falsely reporting compensation.
7. Tavily's 20-second timeout remains a successful ungrounded fallback.
8. Replays cannot duplicate usage, spend, provider-result persistence, or terminal transitions.
9. The client polls only the exact Session ID and never lists Sessions to infer completion.
10. Reload/restart resumes the active Session; sign-out or deliberate exit clears it.
11. Existing UX and accessible state treatment remain intact.
12. Legacy Sessions remain readable and count as successful completed Sessions.
13. Live evidence proves a prompt acknowledgment completes well inside AppSync's boundary while a longer background execution completes and changes usage/spend exactly once.
14. Failed and abnormally long executions are observable without logging sensitive payload bodies.

## 6. Options Evaluated

### Option 1 — Direct Adjustment

**Viable and selected.**
Effort: Medium–High. Risk: Medium.

Preserves provider logic, reservation hardening, deployed UI, and evidence while replacing the flawed execution boundary.

### Option 2 — Roll Back Stories 3.2 and 3.3

**Not viable.**
Effort: High. Risk: High.

Rollback removes working behavior but does not eliminate the need for durable asynchronous execution.

### Option 3 — Reduce or Redefine MVP

**Not warranted.**
Deferring the Orientation Guide removes the product's central differentiator while the approved correction remains achievable.

## 7. MVP and Delivery Impact

The MVP feature set and user promise remain unchanged. The correction adds one implementation story and pauses downstream Epic 3 work until its success gates pass. This is deliberate risk reduction: no further feature development should depend on the temporary synchronous/newest-Session design.

No dedicated visual redesign, new top-level data model, Session-history UI, conversational AI behavior, or Step Functions state machine is added.

## 8. Immediate Action Plan

1. Obtain final approval for this compiled proposal.
2. Apply the approved PRD, addendum, architecture, epic, UX, implementation-note, project-context, and sprint-status edits.
3. Create the dedicated Story 3.8 implementation file and move it to `ready-for-dev`.
4. Start Story 3.8 immediately; do not resume Story 3.3 review or begin Story 3.4/3.5 first.
5. Implement schema migration, starter, durable worker, version/alias, IAM, exact-session client flow, and reload recovery.
6. Run unit, component, durable replay/idempotency, browser, lint, typecheck, and build gates.
7. Deploy to the isolated backend environment and live-verify prompt acknowledgment, >30-second background completion, exact-session rendering, reload recovery, one-time counters, and compensated failure.
8. Review Story 3.8 together with the retained Story 3.3 UI.
9. Promote only after the integrated review passes; then resume Story 3.4.

## 9. Handoff Responsibilities

- **Handoff status:** Ready for immediate Story 3.8 creation and development; no Story 3.3 review or Story 3.4/3.5 work intervenes.
- **Tony / Product Owner:** Final proposal approval; authorize deliberate live Bedrock verification and production promotion.
- **Correct Course agent:** Apply only the approved planning/status changes and record the approval.
- **Story-creation agent:** Produce the context-complete Story 3.8 file from this proposal and set it `ready-for-dev`.
- **Developer agent (Amelia):** Implement Story 3.8 immediately, including migration, infrastructure, backend, frontend, tests, and live verification.
- **Review agent:** Adversarially review the durable/idempotency boundaries and the retained Story 3.3 UI as one integrated flow.
- **Architect role:** Re-enter only if deployment validation disproves Amplify durable support or requires a materially different orchestration boundary.

## 10. Approval Record

Incremental approvals received:

- Trigger and initial direction: approved
- Epic Impact Assessment: approved
- Artifact Conflict and Impact Analysis: approved
- Direct-adjustment path: approved
- PRD edit: approved
- PRD addendum edit: approved
- Architecture edit: approved
- Epic/Story 3.8 edit: approved
- UX edit: approved
- Story 3.2 supersession note: approved
- Story 3.3 freeze note: approved
- Project-context edit: approved
- Sprint-status edit: approved

Final compiled-proposal approval received from Tony on 2026-07-19. The approved artifact edits were authorized for application without additional conditions.

## 11. Workflow Execution Log

- 2026-07-19 — Correct Course analysis completed in incremental mode.
- 2026-07-19 — Trigger, epic impact, artifact impact, path forward, and all nine artifact edits approved.
- 2026-07-19 — Final compiled proposal approved by Tony.
- 2026-07-19 — Approved PRD, addendum, architecture, epic, UX, implementation-note, project-context, and sprint-status edits applied and validated.
- 2026-07-19 — Scope classified as Moderate and routed to Story creation followed immediately by Developer implementation of Story 3.8.
