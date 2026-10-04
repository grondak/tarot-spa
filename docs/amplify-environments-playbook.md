# Amplify Hosting environments playbook

How this project's three environments work, how to bootstrap a fresh one, and the gotchas hit while standing up `staging`/`main` on 2026-10-02/03.

## Topology

One Amplify Hosting app (App ID `d3l9xh49fqq1ce`) connected to `grondak/tarot-spa`, with two branches deployed as fully isolated Gen 2 backends (AD-11): `staging` and `main`. Plus Tony's personal `npx ampx sandbox` environment, which is separate from both and never deploys via Git.

Each environment — sandbox, `staging`, `main` — has its own Cognito pool, DynamoDB tables, Lambdas, and secrets. Nothing carries over between them automatically.

Workflow: each new idea gets its own feature branch cut from `staging`, merged back into `staging` directly (`git merge`, no PR — no branch protection there) once it's done. Ideas accumulate on `staging` like this; when it's in a state worth promoting, open a PR from `staging` into `main` — `main` requires a PR (GitHub branch protection: PR required, no required approving-review count, direct pushes blocked). Merging auto-redeploys `main`.

## Secrets

Three secrets are required by various Lambdas (`orientation-guide`, `request-access`, `budget-alert`, `orientation-alert`, `api-key-alert`):

- `TAVILY_API_KEY` — Tavily search API key, used for grounding Orientation Guide generation in current events.
- `ACCESS_FROM_EMAIL` — the SES "From" address every outbound app email is sent as. Must be a verified SES identity. SES identity verification is account/region-level, not per-environment — the same verified address works across sandbox/staging/main.
- `CUTOUT_EMAIL` — the address that receives admin-facing alert emails (budget alerts, worker failures, API-key expiry reminders, access requests).

**Sandbox** (local CLI):
```
npx ampx sandbox secret set <NAME>     # prompts for the value
npx ampx sandbox secret get <NAME>     # prints the current value
npx ampx sandbox secret list           # names only, no values
```

**`staging`/`main`** (Git-connected branches): secrets are set in the **Amplify Console → App settings → Secrets**, scoped per branch. There is no CLI command for this in the currently installed `@aws-amplify/backend-cli` version — it only exposes `ampx sandbox secret *`, which is sandbox-only. Set all three secrets for a branch *before* its first deploy, or the deploy will fail / the dependent Lambdas will throw their "configuration is missing" guard at runtime.

## Bootstrapping a fresh branch environment

A new branch deploy starts with empty Cognito and empty DynamoDB tables. Nothing from sandbox or another branch carries over. Order matters — it's a chicken-and-egg problem (signup needs a key; minting a key via the UI needs Admin; Admin needs an account):

```
# 1. Point your local amplify_outputs.json at this environment
npx ampx generate outputs --app-id d3l9xh49fqq1ce --branch <staging|main>

# 2. Seed the Config table (dailyLimit/monthlyBudget) — generation fails closed without this
npm run seed-config -- <staging|main> --app-id=d3l9xh49fqq1ce

# 3. Seed one bootstrap Invite Key (bypasses the UI, which requires Admin to mint)
npm run seed-invite-key -- <staging|main> --app-id=d3l9xh49fqq1ce [custom-code]

# 4. Sign up on that environment's deployed URL using the seeded key

# 5. Grant yourself Admin (uses the amplify_outputs.json pointed at this environment from step 1)
npm run grant-admin -- <your-email>

# 6. From here on, mint any further keys via the Admin Dashboard's "Mint Key" control
```

**`amplify_outputs.json` is a single local file describing whichever environment you last pointed it at.** `grant-admin` (and `npm run dev`) read it directly. Switching contexts:

```
npx ampx sandbox --once                                              # back to personal sandbox
npx ampx generate outputs --app-id d3l9xh49fqq1ce --branch staging   # point at staging
npx ampx generate outputs --app-id d3l9xh49fqq1ce --branch main      # point at main
```

## Gotchas hit while standing this up

**SSM namespace differs between sandbox and branch deployments.** `seed-invite-key.mjs`, `seed-config.mjs`, and `backfill-session-status.mjs` resolve table names via an SSM parameter at `/<namespace>/<env-name>/<table>-table-name` (published by `amplify/backend.ts`). Amplify's sandbox CLI namespaces by project name (`tarot-spa`); a Git-connected branch deploy namespaces by **Amplify App ID** instead (confirmed in `@aws-amplify/backend-cli`'s `pipeline_deploy_command.js`: `{ namespace: args.appId, name: args.branch }`). All three scripts now accept `--app-id=<id>` to override the default `tarot-spa` namespace for branch environments — omit it for sandbox.

**`npm ci` fails in the Amplify build with "Missing: X from lock file."** This reproduces even from a pristine, freshly-generated lockfile — it's a version-independent npm resolver quirk around `@opentelemetry/core`, an optional peer dependency pulled in by `@aws-amplify/platform-core`. `npm install` always succeeds where `npm ci` doesn't. Fixed by committing `amplify.yml` with `npm install` in both the backend and frontend phases — do not try to "fix" this by regenerating `package-lock.json` (see next gotcha).

**Regenerating `package-lock.json` from scratch silently bumps pinned versions.** `package.json` only declares caret ranges for `@aws-amplify/backend`/`@aws-amplify/backend-cli`, so deleting and rebuilding the lockfile lets npm resolve whatever is latest-matching *today*, not what was actually tested. This broke Cognito User Pool deployment ("Invalid AttributeDataType input") via a transitive `@aws-amplify/auth-construct`/`backend-auth`/`aws-cdk-lib` version bump. If `package-lock.json` ever needs real changes, diff exact resolved versions for `@aws-amplify/*` and `aws-cdk-lib` against the previous lockfile before committing, not just "does `npm install` complete."

**A newly-set secret may not be visible to an already-warm Lambda container immediately.** Setting a secret in the Console doesn't necessarily propagate to a Lambda execution environment that's already warm from a prior invocation (this project hit the same class of issue with `TAVILY_API_KEY` during Story 3.3/3.8's sandbox work). If a secret-dependent call fails immediately after setting a new secret value, wait a minute or two and retry before assuming the value itself is wrong.

**A single Lambda invocation reporting `"status":"success"` in CloudWatch doesn't mean the business operation succeeded.** The Orientation Guide worker runs as a Lambda Durable Function — each step invocation can complete normally (no crash) while the orchestration logic it's running decides to compensate and mark the Session `FAILED`. The real outcome lives in the `Session` DynamoDB record's `status`/`errorCode` fields, not the Lambda's own invocation status. To debug a failed generation: find the environment's Session table name via `aws ssm get-parameter --name /<namespace>/<env-name>/session-table-name`, then `aws dynamodb scan` it for the most recent item's `status`/`errorCode`. A sub-second `createdAt`→`completedAt` gap with `usageReservedAt`+`usageCompensatedAt` both set points to a fast provider-call failure (e.g. missing/invalid secret), not a real Tavily/Bedrock round trip (those take several seconds to tens of seconds).
