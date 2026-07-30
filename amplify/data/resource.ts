import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { adminMetrics } from '../functions/admin-metrics/resource';
import { checkInviteKey } from '../functions/check-invite-key/resource';
import { inviteKeyMint } from '../functions/invite-key-mint/resource';
import { requestAccess } from '../functions/request-access/resource';
import { startOrientationGuide } from '../functions/start-orientation-guide/resource';
import { usageCounter } from '../functions/usage-counter/resource';

const schema = a.schema({
  Account: a
    .model({
      generation: a.enum(['FirstGen', 'SecondGen']),
      onwardKeyGenerated: a.boolean().default(false),
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
  Config: a
    .model({
      dailyLimit: a.integer(),
      monthlyBudget: a.float(),
    })
    .authorization((allow) => [allow.authenticated().to([])]),
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
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    apiKeyAuthorizationMode: { expiresInDays: 30 },
  },
});
