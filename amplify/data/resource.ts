import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import {
  DAILY_LIMIT_MAX,
  DAILY_LIMIT_MIN,
  DAILY_LIMIT_VALIDATION_MESSAGE,
  MAX_MONTHLY_BUDGET_USD,
  MIN_MONTHLY_BUDGET_USD,
  MONTHLY_BUDGET_VALIDATION_MESSAGE,
} from '../config';
import { adminLogs } from '../functions/admin-logs/resource';
import { adminMetrics } from '../functions/admin-metrics/resource';
import { checkInviteKey } from '../functions/check-invite-key/resource';
import { inviteKeyMint } from '../functions/invite-key-mint/resource';
import { inviteKeyRevoke } from '../functions/invite-key-revoke/resource';
import { requestAccess } from '../functions/request-access/resource';
import { startOrientationGuide } from '../functions/start-orientation-guide/resource';
import { usageCounter } from '../functions/usage-counter/resource';
import { widenSearch } from '../functions/widen-search/resource';

const schema = a.schema({
  Account: a
    .model({
      generation: a.enum(['FirstGen', 'SecondGen']),
      onwardKeyGenerated: a.boolean().default(false),
      // Captured once at signup (post-confirmation) for the admin-facing
      // signup log — identity, never content. Not used for anything
      // functional (sign-in/sign-up both go through Cognito directly).
      email: a.string(),
      redeemedInviteKey: a.string(),
    })
    // `.identityClaim('sub')` matches the bare Cognito `sub` the post-confirmation
    // trigger writes to `owner` (it writes directly via DynamoDB, bypassing AppSync's
    // default `sub::username` owner-field format).
    // `.to(['read'])`: the owner may only read their own Account, not create/update/delete
    // it via the API — otherwise a signed-in user could rewrite their own `generation` or
    // `onwardKeyGenerated`, or reassign `owner` to someone else (exactly the risk Amplify's
    // own deploy-time warning flags for plain `allow.owner()`). Every write to Account is
    // meant to happen exclusively through the trusted post-confirmation Lambda's direct
    // IAM/DynamoDB access, which bypasses this rule entirely.
    .authorization((allow) => [allow.owner().identityClaim('sub').to(['read'])]),
  InviteKey: a
    .model({
      status: a.enum(['unredeemed', 'redeemed', 'revoked']),
      generation: a.enum(['FirstGen', 'SecondGen']),
      redeemedBy: a.id(),
      // Admin-facing minting/admin-action logs: who minted this key (every
      // key has one — self-serve mints set it to the minting user's own
      // sub) and, if applicable, who revoked it and when.
      mintedBy: a.string(),
      revokedBy: a.string(),
      revokedAt: a.datetime(),
    })
    // No default CRUD via GraphQL for any principal: InviteKey has no per-user owner
    // (it's minted by an operator, redeemed by someone without an identity yet). All
    // access is either direct IAM (backend.ts grants to the post-confirmation Lambda
    // and the seed script) or the `checkInviteKey` query below, which has its own
    // explicit `allow.publicApiKey()` rule.
    .authorization((allow) => [allow.authenticated().to([])]),
  Session: a
    .model({
      spreadKey: a.string(),
      context: a.string(),
      cards: a.json(),
      currentEvents: a.json(),
      guide: a.string(),
      tavilyTimedOut: a.boolean(),
      groundednessScore: a.float(),
      status: a.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']),
      errorCode: a.string(),
      completedAt: a.datetime(),
      // DynamoDB TTL attribute (Unix epoch seconds) — enabled in backend.ts.
      // Set once at creation in start-orientation-guide; AWS auto-deletes the
      // row after this time (usually within ~48h of it elapsing).
      expiresAt: a.integer(),
      // Set once, by whichever of session-scrubber or scripts/scrub-old-sessions.mjs
      // gets to this row first (attribute_not_exists(scrubbedAt) condition on the
      // write): marks that context/guide have been overwritten with the fixed
      // placeholder copy, and is the idempotency guard against re-scrubbing.
      scrubbedAt: a.datetime(),
    })
    // The owner may only read their own Session. Every write goes through the
    // orientation-guide Lambda's direct IAM/DynamoDB access.
    .authorization((allow) => [allow.owner().identityClaim('sub').to(['read'])]),
  DailyUsage: a
    .model({
      count: a.integer(),
    })
    .authorization((allow) => [allow.owner().identityClaim('sub').to(['read'])]),
  MonthlySpend: a
    .model({
      spent: a.float(),
    })
    .authorization((allow) => [allow.authenticated().to([])]),
  // Lifetime running counters for adminMetrics, so its dashboard numbers stay
  // accurate once Session rows start expiring via TTL. Incremented atomically
  // (DynamoDB `ADD`) by orientation-guide (on SUCCEEDED) and orientation-judge
  // (on scoring) — never by anything else. No default CRUD for any principal,
  // same lockdown as MonthlySpend: every read/write is direct IAM.
  Metrics: a
    .model({
      succeededSessionCount: a.integer(),
      scoredSessionCount: a.integer(),
      groundednessScoreSum: a.float(),
    })
    .authorization((allow) => [allow.authenticated().to([])]),
  // Content-free, permanent record of finished Orientation Guide requests
  // for the admin-facing questions log: who, when, how long, whether it
  // produced a result — deliberately no context/guide/cards field exists
  // here at all, so there's nothing to accidentally expose. Unlike Session,
  // no TTL: nothing sensitive in it, so it's kept indefinitely. Written by
  // orientation-guide (on SUCCEEDED/FAILED) and orientation-reconciler (on
  // terminalizing a stuck PENDING session) via the shared writeQuestionLog
  // helper. No default CRUD for any principal — same lockdown as Metrics.
  QuestionLog: a
    .model({
      owner: a.string(),
      occurredAt: a.datetime(),
      durationMs: a.integer(),
      hadResult: a.boolean(),
    })
    .authorization((allow) => [allow.authenticated().to([])]),
  Config: a
    .model({
      dailyLimit: a.integer().required().validate(
        (v) => v.gte(DAILY_LIMIT_MIN, DAILY_LIMIT_VALIDATION_MESSAGE).lte(DAILY_LIMIT_MAX, DAILY_LIMIT_VALIDATION_MESSAGE),
      ),
      monthlyBudget: a.float().required().validate(
        (v) => v.gte(MIN_MONTHLY_BUDGET_USD, MONTHLY_BUDGET_VALIDATION_MESSAGE).lte(MAX_MONTHLY_BUDGET_USD, MONTHLY_BUDGET_VALIDATION_MESSAGE),
      ),
    })
    // Browser access is update-only: no create/read/delete/list/subscription. The
    // generated update resolver's `attributeExists` key condition means a missing/
    // wrong id fails instead of creating a second row. Seeding stays trusted/operator-only.
    .authorization((allow) => [allow.group('Admin').to(['update'])]),
  // Observation Window (epic F9). These four models are shared across users: one set of
  // collected feeds, readable by every signed-in user and written only by feed-collector
  // through direct IAM/DynamoDB access. There is deliberately no browser write path, and no
  // per-user data in any of them.
  Feed: a
    .model({
      name: a.string().required(),
      group: a.string().required(),
      url: a.string().required(),
      // Position in the starter list. Source order is the ranking until stakes exist (S2.8).
      sortOrder: a.integer().required(),
      // 'starter' feeds are lanes everyone sees; 'pool' feeds are the outside-interest pool,
      // shown to each user only as a daily pick (S2.3). Absent on rows from before the pool existed.
      kind: a.string(),
      // Pool feeds only: the one-line "why am I seeing this" shown beside an injected item (S2.4).
      reason: a.string(),
      lastFetchedAt: a.datetime(),
      lastStatus: a.string(),
      lastError: a.string(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),
  // One row per story, kept 30 days (FEED_ITEM_RETENTION_DAYS) by DynamoDB TTL on `expiresAt`,
  // enabled in backend.ts. `id` is a hash of the canonical link, so the same story from two
  // feeds, or from two runs, is one row listing every feed that carried it. The client lists
  // the whole table and filters by time itself: the data is small and shared by everyone.
  FeedItem: a
    .model({
      title: a.string(),
      link: a.string().required(),
      summary: a.string(),
      publishedAt: a.datetime().required(),
      // True when the feed gave no date and publishedAt is the fetch time instead.
      publishedAtEstimated: a.boolean(),
      sources: a.string().array().required(),
      fetchedAt: a.datetime(),
      expiresAt: a.integer(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),
  // Items per source per day, kept after the items expire so baselines and expected-event checks
  // work past 30 days (epic S9.9). Holds no text and nothing tied to a user.
  FeedDailyCount: a
    .model({
      feedId: a.string().required(),
      day: a.string().required(),
      count: a.integer(),
    })
    .identifier(['feedId', 'day'])
    .authorization((allow) => [allow.authenticated().to(['read'])]),
  // One row per collector run, so the Window can show a stretch where nothing ran as a gap
  // instead of mistaking it for a quiet day (epic S9.7). Kept 60 days by TTL.
  CollectorRun: a
    .model({
      startedAt: a.datetime().required(),
      finishedAt: a.datetime(),
      feedsOk: a.integer(),
      feedsTotal: a.integer(),
      added: a.integer(),
      // Per-feed outcome, stored as JSON text. Preserve the typeof-string parse guard where read.
      results: a.json(),
      expiresAt: a.integer(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),
  checkInviteKey: a
    .query()
    .arguments({ code: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(checkInviteKey)),
  mintOnwardKey: a
    .mutation()
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(inviteKeyMint)),
  adminMintInviteKey: a
    .mutation()
    .returns(a.string())
    .authorization((allow) => [allow.group('Admin')])
    .handler(a.handler.function(inviteKeyMint)),
  revokeInviteKey: a
    .mutation()
    .arguments({ code: a.string().required() })
    .returns(a.boolean())
    .authorization((allow) => [allow.group('Admin')])
    .handler(a.handler.function(inviteKeyRevoke)),
  requestAccess: a
    .mutation()
    .arguments({ name: a.string().required(), email: a.string().required() })
    .returns(a.boolean())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(requestAccess)),
  startOrientationGuide: a
    .mutation()
    .arguments({
      requestId: a.string().required(),
      context: a.string().required(),
      spreadKey: a.string().required(),
      // Optional encodeDraw() code: the cards the user already saw and chose.
      // Absent, the worker draws server-side as before.
      drawCode: a.string(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(startOrientationGuide)),
  getOrientationStatus: a
    .query()
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(usageCounter)),
  adminMetrics: a
    .query()
    .returns(a.json())
    .authorization((allow) => [allow.group('Admin')])
    .handler(a.handler.function(adminMetrics)),
  adminLogs: a
    .query()
    .returns(a.json())
    .authorization((allow) => [allow.group('Admin')])
    .handler(a.handler.function(adminLogs)),
  widenSearch: a
    .query()
    .arguments({ term: a.string().required() })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(widenSearch)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    apiKeyAuthorizationMode: { expiresInDays: 30 },
  },
});
