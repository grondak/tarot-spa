---
project_name: 'tarot-spa'
user_name: 'Tony'
date: '2026-07-19'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'backend_rules', 'durable_execution_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 70
optimized_for_llm: true
---

# Project Context for AI Agents

_Critical implementation rules and patterns for this repository. Read before changing code._

## Technology Stack & Versions

- React 19.2 + React DOM 19.2; Vite 7.3; Tailwind CSS 4.2 through `@tailwindcss/vite`
- Plain JavaScript/JSX in `src/**`; no TypeScript or PropTypes in frontend runtime code
- TypeScript 5.9 for Amplify Gen 2 backend definitions, Lambda handlers, configuration, and typechecking
- Amplify Gen 2: Cognito Auth, AppSync GraphQL, DynamoDB Data, Lambda Functions, and Amplify Hosting
- AWS SDK v3 for DynamoDB, Bedrock Runtime, Cognito, SES, and SSM
- Lambda Durable Functions for Orientation Guide execution (AD-19)
- Vitest 3.2 + React Testing Library + jsdom for unit/component tests
- Playwright 1.61 for browser tests
- ESLint 9.39 flat config; no Prettier
- No routing library, state-management library, or HTTP-client abstraction

## Critical Implementation Rules

### Language and Structure

- Named exports for utilities in `src/utils/*.js`; default exports for components and `App.jsx`
- Keep frontend code JavaScript/JSX. TypeScript belongs in `amplify/**`, scripts/configuration that already use it, and type-only tooling.
- Derive cards and spreads from `FULL_DECK` and `SPREADS`; never hardcode parallel deck/spread structures.
- Frontend structure remains flat and purpose-based: `src/components/`, `src/utils/`, `src/data/`.
- Backend functions live at `amplify/functions/<capability>/` with `resource.ts` and `handler.ts`.
- Use PascalCase for components/models, camelCase for utilities, SCREAMING_SNAKE_CASE for exported constants, and kebab-case for Lambda directories.
- Keep comments focused on security, idempotency, provider behavior, or non-obvious infrastructure constraints.

### React and Client State

- App-wide state remains owned by `App.jsx` and passed through props; do not introduce Context or an external state library without an explicit architecture decision.
- Async effects must clean up timers/listeners and must not update state after unmount or sign-out.
- Authenticated client calls live in thin named utilities under `src/utils/`.
- Amplify `a.json()` values may arrive as JSON strings. Preserve the defensive `typeof value === 'string' ? JSON.parse(value) : value` guard at every relevant boundary.
- Stable backend error codes cross the client boundary; internal exception details do not.
- Loading uses `role="status"` and errors use `role="alert"`. Do not repeatedly announce an unchanged polled status.
- Duplicate paid submissions remain disabled while an Orientation Guide request is active.

### Backend and Authorization

- Keep thin Lambda capability boundaries. Do not add repository/DAO layers, service layers, or dependency-injection containers.
- Short-lived capabilities use one Lambda. The Orientation Guide is the approved exception: a synchronous `start-orientation-guide` adapter plus durable `orientation-guide` worker.
- Browser writes use explicitly authorized AppSync operations. Trusted backend writes use narrowly scoped IAM/DynamoDB access.
- Owner-protected records use the bare Cognito `sub` identity convention established in the schema.
- Session remains owner-readable and never browser-writable.
- Grant each function only the tables/actions it needs. The starter may create/read/update Sessions and invoke only the qualified worker; the worker may read/update Sessions, read Config, transact counters, call Bedrock, and access the Tavily secret.
- Config is read once per generation and the same snapshot governs both counter checks.
- DailyUsage and MonthlySpend reservation/compensation remain atomic DynamoDB transactions.
- Tavily timeout is a successful ungrounded fallback; outright provider failure is compensated.
- Secrets use Amplify secret management or environment-only test configuration. Never commit credentials, test-account secrets, provider keys, or generated auth state.
- Do not log Context, Tavily evidence, prompts, Guides, credentials, or secret values.

### Durable Orientation Guide Execution

- The browser calls only `startOrientationGuide`; it never invokes or retries the worker.
- A client-generated UUID is simultaneously `requestId`, Session id, and durable execution name.
- Identical duplicate starts resolve to the existing Session. Reusing an id with different owner/input returns `IDEMPOTENCY_CONFLICT`.
- The starter creates the owner-bound `PENDING` Session before starting background work.
- Invoke a numbered worker version or controlled alias; never use `$LATEST` for production durable executions.
- Worker input contains only Session id. Load Context and Spread from DynamoDB.
- Normal Session lifecycle is `PENDING → RUNNING → SUCCEEDED | FAILED`. A Session may remain parked in `RUNNING` only when post-provider result persistence or required compensation exhausts retries; that is an alarm-backed operational exception, not a user-visible success or failure.
- The client polls only `Session.get(sessionId)`. Listing Sessions or inferring completion from newest `createdAt` is prohibited.
- Persist only two client-side items: the active Session id for reload recovery, and the redraw Context draft (`tarotSpaOrientationRedrawContext`, Story 3.4, Tony-approved 2026-07-24) so "Tweak existing observation" survives a reload. Clear the Session id on sign-out, deliberate exit, or confirmed terminal failure; clear the draft on Fresh redraw, the next submission start, sign-out, or any auth loss (deliberate privacy default — token expiry also wipes it). A 300-second observation deadline is indeterminate: stop polling but retain the exact id for an explicit later check. No other Context, Guide, or Session content may be persisted client-side.
- If the start response is ambiguous, query the already-known request/Session id before permitting another submission.
- Durable steps are independently idempotent. Runtime replay does not make external side effects exactly-once.
- Reservation and compensation tokens remove UUID dashes and append `RES` / `RBK` respectively (35 characters), preserving deterministic distinct tokens within DynamoDB's 36-character limit.
- Compensable pre-completion failures complete rollback before the Session transitions to `FAILED`. Once a successful Bedrock result is checkpointed, persistence retries from that checkpoint and the cost reservation remains because real provider spend occurred.
- Durable execution history uses short retention and least-privilege IAM.
- After every worker deploy, probe Tavily through the `live` alias before any paid generation; an unqualified `$LATEST` probe is not deployment evidence.
- Worker Lambda errors page Tony by SNS/email. Tony acknowledges within one hour and reconciles parked `RUNNING` Sessions within one business day using `docs/orientation-guide-reconciliation.md`; never copy Context or Guide content into logs or tickets.
- Quick Draw and draw-code sharing remain entirely separate from Orientation Guide Sessions.

### Testing

- `npm test` runs Vitest/RTL unit and component tests.
- `npm run test:e2e` runs Playwright; authenticated projects appear only when test credentials are present.
- `npm run lint`, `npm run typecheck`, and `npm run build` are required closeout gates.
- Mock AWS/provider seams in unit tests and test observable contracts rather than implementation call counts alone.
- Real Bedrock generation is deliberate live verification, never an always-on unit, E2E, or CI action.
- Durable coverage must include duplicate starts, conflicting ids, replayed state-changing steps, compensation, exact-Session isolation, reload recovery, ambiguous acknowledgment, and legacy Session migration.
- Live verification must prove prompt acknowledgment completes well inside AppSync's boundary while a longer worker completes and changes usage/spend exactly once.
- Never commit live personal Context/Guide content in fixtures, screenshots, logs, or story artifacts.

### Quality and Workflow

- ESLint uses flat config and treats unused variables as errors except established uppercase-name exceptions.
- Vite base is `/`; do not reintroduce the retired `/tarot-spa/` GitHub Pages base.
- Amplify Gen 2 owns backend and hosting infrastructure. Sandbox/staging verification precedes production promotion; `main` is the production path.
- Preserve unrelated dirty-worktree changes.
- Definition of Done includes tests, lint, typecheck, build, proportional browser/live verification, credential sweep, changed-file inventory, commit, and push when the story requires it.
- Do not add paid generation to permanent Playwright or CI flows.
- `playwright/.auth/` and local credential files remain untracked.
- Completed story records are append-only historical evidence. Record superseding decisions explicitly instead of rewriting their execution history.

## Usage Guidelines

- Read this file and the current architecture spine before implementation.
- Follow the most specific approved story or architecture decision when it supersedes an older implementation note.
- Story 3.8 supersedes Stories 3.2/3.3 only for Orientation Guide invocation, lifecycle, idempotency, and completion tracking; their provider, reservation, UI, and live-evidence work remains reusable.
- Update this file when a new durable/backend pattern is adopted and verified.

Last Updated: 2026-07-19
