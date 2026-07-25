import {
  Duration,
  Stack,
} from 'aws-cdk-lib';
import { defineBackend } from '@aws-amplify/backend';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Alias,
  CfnFunction,
  Function,
} from 'aws-cdk-lib/aws-lambda';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction as LambdaFunctionTarget } from 'aws-cdk-lib/aws-events-targets';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { CfnWebACL, CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { postConfirmation } from './auth/post-confirmation/resource';
import { checkInviteKey } from './functions/check-invite-key/resource';
import { inviteKeyMint } from './functions/invite-key-mint/resource';
import { orientationGuide } from './functions/orientation-guide/resource';
import { orientationAlert } from './functions/orientation-alert/resource';
import { orientationReconciler } from './functions/orientation-reconciler/resource';
import { requestAccess } from './functions/request-access/resource';
import { startOrientationGuide } from './functions/start-orientation-guide/resource';
import { usageCounter } from './functions/usage-counter/resource';

const backend = defineBackend({
  auth,
  data,
  postConfirmation,
  checkInviteKey,
  inviteKeyMint,
  orientationAlert,
  orientationGuide,
  orientationReconciler,
  requestAccess,
  startOrientationGuide,
  usageCounter,
});

const accountTable = backend.data.resources.tables.Account;
const configTable = backend.data.resources.tables.Config;
const dailyUsageTable = backend.data.resources.tables.DailyUsage;
const inviteKeyTable = backend.data.resources.tables.InviteKey;
const monthlySpendTable = backend.data.resources.tables.MonthlySpend;
const sessionTable = backend.data.resources.tables.Session;
const redemptionLambda = backend.postConfirmation.resources.lambda;
const checkInviteKeyLambda = backend.checkInviteKey.resources.lambda;
const inviteKeyMintLambda = backend.inviteKeyMint.resources.lambda;
const orientationGuideLambda = backend.orientationGuide.resources.lambda;
const orientationAlertLambda = backend.orientationAlert.resources.lambda;
const orientationReconcilerLambda = backend.orientationReconciler.resources.lambda;
const requestAccessLambda = backend.requestAccess.resources.lambda;
const startOrientationGuideLambda = backend.startOrientationGuide.resources.lambda;
const usageCounterLambda = backend.usageCounter.resources.lambda;

// The cutout identity is a runtime secret, so its exact ARN is unavailable at synth.
// Accepted residual risk: one action on this single Lambda may target any SES identity
// in this account/region, matching the existing User Pool wildcard rationale below.
const dataStack = Stack.of(accountTable);
const operationalStack = Stack.of(backend.data.resources.graphqlApi);
const workerDeadLetterQueue = new Queue(
  operationalStack,
  'OrientationGuideWorkerDeadLetterQueue',
  {
  encryption: QueueEncryption.SQS_MANAGED,
  retentionPeriod: Duration.days(14),
  },
);
const workerCfnFunction = orientationGuideLambda.node.defaultChild as CfnFunction;
workerCfnFunction.deadLetterConfig = { targetArn: workerDeadLetterQueue.queueArn };
workerDeadLetterQueue.grantSendMessages(orientationGuideLambda);
const workerVersion = (orientationGuideLambda as Function).currentVersion;
const workerAlias = new Alias(dataStack, 'OrientationGuideLive', {
  aliasName: 'live',
  version: workerVersion,
});
const workerFailureTopic = new Topic(
  operationalStack,
  'OrientationGuideWorkerFailureTopic',
);
const alertDeliveryDeadLetterQueue = new Queue(
  operationalStack,
  'OrientationGuideAlertDeliveryDeadLetterQueue',
  {
    encryption: QueueEncryption.SQS_MANAGED,
    retentionPeriod: Duration.days(14),
  },
);
const alertCfnFunction = orientationAlertLambda.node.defaultChild as CfnFunction;
alertCfnFunction.deadLetterConfig = { targetArn: alertDeliveryDeadLetterQueue.queueArn };
alertDeliveryDeadLetterQueue.grantSendMessages(orientationAlertLambda);
workerFailureTopic.addSubscription(new LambdaSubscription(orientationAlertLambda, {
  deadLetterQueue: alertDeliveryDeadLetterQueue,
}));
const workerFailureAlarm = new Alarm(
  operationalStack,
  'OrientationGuideWorkerFailureAlarm',
  {
  // Persistence exhaustion logs ORIENTATION_GUIDE_PERSISTENCE_FAILED and rethrows,
  // so it always increments this native metric without extra runtime IAM or log wiring.
  metric: orientationGuideLambda.metricErrors({
    period: Duration.minutes(5),
    statistic: 'Sum',
  }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  treatMissingData: TreatMissingData.NOT_BREACHING,
  },
);
workerFailureAlarm.addAlarmAction(new SnsAction(workerFailureTopic));
const durableExecutionFailureAlarm = new Alarm(
  operationalStack,
  'OrientationGuideDurableExecutionFailureAlarm',
  {
    metric: workerAlias.metric('DurableExecutionFailed', {
      period: Duration.minutes(5),
      statistic: 'Sum',
    }),
    threshold: 1,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  },
);
durableExecutionFailureAlarm.addAlarmAction(new SnsAction(workerFailureTopic));
const durableExecutionTimeoutAlarm = new Alarm(
  operationalStack,
  'OrientationGuideDurableExecutionTimeoutAlarm',
  {
    metric: workerAlias.metric('DurableExecutionTimedOut', {
      period: Duration.minutes(5),
      statistic: 'Sum',
    }),
    threshold: 1,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  },
);
durableExecutionTimeoutAlarm.addAlarmAction(new SnsAction(workerFailureTopic));
const workerDeadLetterAlarm = new Alarm(
  operationalStack,
  'OrientationGuideWorkerDeadLetterAlarm',
  {
  metric: workerDeadLetterQueue.metricApproximateNumberOfMessagesVisible({
    period: Duration.minutes(5),
    statistic: 'Maximum',
  }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  treatMissingData: TreatMissingData.NOT_BREACHING,
  },
);
workerDeadLetterAlarm.addAlarmAction(new SnsAction(workerFailureTopic));
const alertDeliveryFailureAlarm = new Alarm(
  operationalStack,
  'OrientationGuideAlertDeliveryFailureAlarm',
  {
    metric: alertDeliveryDeadLetterQueue.metricApproximateNumberOfMessagesVisible({
      period: Duration.minutes(5),
      statistic: 'Maximum',
    }),
    threshold: 1,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  },
);
alertDeliveryFailureAlarm.addAlarmAction(new SnsAction(workerFailureTopic));
const alertLambdaErrorAlarm = new Alarm(
  operationalStack,
  'OrientationGuideAlertLambdaErrorAlarm',
  {
  metric: orientationAlertLambda.metricErrors({
    period: Duration.minutes(5),
    statistic: 'Sum',
  }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  treatMissingData: TreatMissingData.NOT_BREACHING,
  },
);
alertLambdaErrorAlarm.addAlarmAction(new SnsAction(workerFailureTopic));
orientationAlertLambda.addToRolePolicy(new PolicyStatement({
  actions: ['ses:SendEmail'],
  resources: [
    dataStack.formatArn({ service: 'ses', resource: 'identity', resourceName: '*' }),
  ],
}));
requestAccessLambda.addToRolePolicy(new PolicyStatement({
  actions: ['ses:SendEmail'],
  resources: [
    dataStack.formatArn({ service: 'ses', resource: 'identity', resourceName: '*' }),
  ],
}));

// checkInviteKey lives in the same nested stack as `data` (resourceGroupName: 'data' on
// both), so this is a same-stack reference — safe to grant directly, no cycle risk.
inviteKeyTable.grantReadData(checkInviteKeyLambda);
backend.checkInviteKey.addEnvironment('INVITE_KEY_TABLE_NAME', inviteKeyTable.tableName);

accountTable.grantWriteData(inviteKeyMintLambda);
inviteKeyTable.grantWriteData(inviteKeyMintLambda);
backend.inviteKeyMint.addEnvironment('ACCOUNT_TABLE_NAME', accountTable.tableName);
backend.inviteKeyMint.addEnvironment('INVITE_KEY_TABLE_NAME', inviteKeyTable.tableName);

sessionTable.grant(
  orientationGuideLambda,
  'dynamodb:GetItem',
  'dynamodb:UpdateItem',
);
dailyUsageTable.grantReadWriteData(orientationGuideLambda);
monthlySpendTable.grantReadWriteData(orientationGuideLambda);
configTable.grantReadData(orientationGuideLambda);
backend.orientationGuide.addEnvironment('SESSION_TABLE_NAME', sessionTable.tableName);
backend.orientationGuide.addEnvironment('DAILY_USAGE_TABLE_NAME', dailyUsageTable.tableName);
backend.orientationGuide.addEnvironment('MONTHLY_SPEND_TABLE_NAME', monthlySpendTable.tableName);
backend.orientationGuide.addEnvironment('CONFIG_TABLE_NAME', configTable.tableName);

sessionTable.grant(
  startOrientationGuideLambda,
  'dynamodb:GetItem',
  'dynamodb:PutItem',
);
workerAlias.grantInvoke(startOrientationGuideLambda);
backend.startOrientationGuide.addEnvironment('SESSION_TABLE_NAME', sessionTable.tableName);
backend.startOrientationGuide.addEnvironment(
  'ORIENTATION_GUIDE_FUNCTION_ARN',
  workerAlias.functionArn,
);

sessionTable.grant(
  orientationReconcilerLambda,
  'dynamodb:Scan',
  'dynamodb:UpdateItem',
);
workerAlias.grantInvoke(orientationReconcilerLambda);
orientationReconcilerLambda.addToRolePolicy(new PolicyStatement({
  actions: ['lambda:ListDurableExecutionsByFunction'],
  resources: [workerAlias.functionArn],
}));
backend.orientationReconciler.addEnvironment('SESSION_TABLE_NAME', sessionTable.tableName);
backend.orientationReconciler.addEnvironment(
  'ORIENTATION_GUIDE_FUNCTION_ARN',
  workerAlias.functionArn,
);
backend.orientationReconciler.addEnvironment(
  'ORIENTATION_GUIDE_FUNCTION_NAME',
  orientationGuideLambda.functionName,
);
backend.orientationReconciler.addEnvironment(
  'ORIENTATION_GUIDE_FUNCTION_QUALIFIER',
  workerAlias.aliasName,
);
const reconciliationSchedule = new Rule(
  operationalStack,
  'OrientationGuideReconciliationSchedule',
  { schedule: Schedule.rate(Duration.minutes(1)) },
);
reconciliationSchedule.addTarget(new LambdaFunctionTarget(orientationReconcilerLambda));

dailyUsageTable.grantReadData(usageCounterLambda);
configTable.grantReadData(usageCounterLambda);
backend.usageCounter.addEnvironment('DAILY_USAGE_TABLE_NAME', dailyUsageTable.tableName);
backend.usageCounter.addEnvironment('CONFIG_TABLE_NAME', configTable.tableName);

// Cross-region inference profiles fan out to account-less foundation models in
// multiple US regions. Accepted residual risk: the foundation-model resource uses
// a region wildcard, but remains scoped to this exact Opus model and one action.
orientationGuideLambda.addToRolePolicy(new PolicyStatement({
  actions: ['bedrock:InvokeModel'],
  resources: [
    dataStack.formatArn({
      service: 'bedrock',
      resource: 'inference-profile',
      resourceName: 'us.anthropic.claude-opus-4-6-v1',
    }),
    'arn:aws:bedrock:*::foundation-model/anthropic.claude-opus-4-6-v1',
  ],
}));

// redemptionLambda (postConfirmation) lives in the `auth` nested stack. `data` already
// depends on `auth` (owner-based authorization needs the User Pool). Referencing
// accountTable/inviteKeyTable's live CDK tokens (tableArn/tableName getters) directly from
// here would add the reverse edge auth -> data, producing a CloudFormation circular
// nested-stack dependency (confirmed via `npx ampx sandbox`:
// CloudformationStackCircularDependencyError between [auth, data]).
//
// `Stack.exportValue`/`Fn::ImportValue` looks like the fix but ISN'T: it only defers the
// failure from synth-time (a clear cycle error) to deploy-time (confirmed: "No export named
// ...AccountTableName found", because `data` hasn't deployed yet when `auth` tries to import
// it — `data` can't deploy first either, since it needs `auth`'s User Pool for owner-auth).
// Hardcoding custom physical table names isn't viable either (confirmed via a failed fresh
// deploy: Amplify's own table-manager role is only authorized for `dynamodb:CreateTable` on
// Amplify's default table names, so a custom-named `Custom::AmplifyDynamoDBTable` fails with
// an IAM error). The two stacks have a genuine mutual deploy-time dependency.
//
// The fix: break the dependency at *runtime* instead of deploy time. The data stack writes
// its real (default-named) table names to SSM parameters at fixed paths both stacks can
// compute as plain strings; the Lambda reads them once at cold start. No cross-stack
// references, nothing to order at deploy time. Amplify's default table names already embed
// the per-environment AppSync API id, so `staging`/`main`/sandboxes can't collide.
const backendNamespace = accountTable.node.tryGetContext('amplify-backend-namespace');
const backendName = accountTable.node.tryGetContext('amplify-backend-name');
if (!backendNamespace || !backendName) {
  // The SSM paths must be unique per environment. Silently falling back to a fixed string
  // would let two environments read each other's table names — fail synth instead.
  throw new Error(
    'Missing amplify-backend-namespace/amplify-backend-name CDK context — refusing to fall back to a shared SSM path.',
  );
}
const ssmPrefix = `/${backendNamespace}/${backendName}`;
const accountTableParam = `${ssmPrefix}/account-table-name`;
const configTableParam = `${ssmPrefix}/config-table-name`;
const inviteKeyTableParam = `${ssmPrefix}/invite-key-table-name`;
const sessionTableParam = `${ssmPrefix}/session-table-name`;

// Same-stack live refs (table -> parameter, both in `data`) — no cycle risk.
new StringParameter(dataStack, 'AccountTableNameParam', {
  parameterName: accountTableParam,
  stringValue: accountTable.tableName,
});
new StringParameter(dataStack, 'InviteKeyTableNameParam', {
  parameterName: inviteKeyTableParam,
  stringValue: inviteKeyTable.tableName,
});
new StringParameter(dataStack, 'ConfigTableNameParam', {
  parameterName: configTableParam,
  stringValue: configTable.tableName,
});
new StringParameter(dataStack, 'SessionTableNameParam', {
  parameterName: sessionTableParam,
  stringValue: sessionTable.tableName,
});

// The Lambda gets the SSM *paths* (plain strings) and resolves the names at cold start.
backend.postConfirmation.addEnvironment('ACCOUNT_TABLE_PARAM', accountTableParam);
backend.postConfirmation.addEnvironment('INVITE_KEY_TABLE_PARAM', inviteKeyTableParam);

// IAM, all built from plain strings/patterns (Stack pseudo-parameters only, no construct
// attributes — see the User Pool ARN note below for why):
// - SSM read on this environment's parameter path.
// - DynamoDB actions on `table/Account-*`/`table/InviteKey-*`: Amplify's default physical
//   names are `<Model>-<apiId>-NONE`, and the apiId isn't knowable here as a plain string,
//   so match on the model-name prefix. Slightly broader than one exact table (it matches
//   any table with that prefix in this account/region), accepted for the same reason as
//   the User Pool wildcard below.
const authStack = Stack.of(redemptionLambda);
redemptionLambda.addToRolePolicy(new PolicyStatement({
  actions: ['ssm:GetParameter'],
  resources: [
    authStack.formatArn({ service: 'ssm', resource: 'parameter', resourceName: `${backendNamespace}/${backendName}/*` }),
  ],
}));
redemptionLambda.addToRolePolicy(new PolicyStatement({
  actions: [
    'dynamodb:GetItem',
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
    'dynamodb:ConditionCheckItem',
  ],
  resources: [
    authStack.formatArn({ service: 'dynamodb', resource: 'table', resourceName: 'Account-*' }),
    authStack.formatArn({ service: 'dynamodb', resource: 'table', resourceName: 'InviteKey-*' }),
  ],
}));

// Referencing `backend.auth.resources.userPool.userPoolArn` directly here creates a
// same-stack circular resource dependency: the User Pool needs this Lambda as its
// postConfirmation trigger (Pool -> Lambda), and the Lambda's IAM policy would need the
// Pool's ARN attribute (Lambda -> Pool) — CloudFormation can't order two resources that
// each depend on the other (confirmed via deploy: CloudformationResourceCircularDependencyError
// among amplifyAuthUserPool/UserPoolPostConfirmationCognito/redeeminvitekeylambda*). Build
// the ARN as a template string (Stack pseudo-parameters, not a construct attribute) instead —
// this doesn't create a construct-to-construct dependency edge. Scoped to this stack's own
// account/region, but NOT to this specific User Pool — Cognito assigns the physical pool id
// and there's no plain-string prefix to narrow on (the DynamoDB grants above at least narrow
// to the `Account-*`/`InviteKey-*` model-name prefixes). Accepted residual risk: this grants
// `AdminDeleteUser` against any User Pool in this account/region, not just this stack's own.
// Mitigated by scope (single action, single Lambda, only invoked from this one trigger) but
// not eliminated — revisit if this account ever hosts an unrelated Cognito pool.
const userPoolArnPattern = authStack.formatArn({
  service: 'cognito-idp',
  resource: 'userpool',
  resourceName: '*',
});

redemptionLambda.addToRolePolicy(new PolicyStatement({
  actions: ['cognito-idp:AdminDeleteUser'],
  resources: [userPoolArnPattern],
}));

// Loose rate limiting on `checkInviteKey` specifically — scoped via a scope-down statement
// so it only counts requests naming that operation, not all GraphQL traffic on this API
// (Account/InviteKey otherwise require owner auth or IAM, but later stories will add
// ordinary authenticated GraphQL calls that shouldn't share this budget). Traffic here is
// expected to be humans typing codes plus occasional test runs, not bots, so this uses AWS
// WAF's practical minimum rate-based threshold rather than anything strict.
const inviteKeyRateLimit = new CfnWebACL(dataStack, 'ApiRateLimit', {
  scope: 'REGIONAL',
  defaultAction: { allow: {} },
  visibilityConfig: {
    sampledRequestsEnabled: true,
    cloudWatchMetricsEnabled: true,
    metricName: 'tarotSpaApiDefault',
  },
  rules: [
    {
      name: 'RateLimitPerIp',
      priority: 0,
      action: { block: {} },
      statement: {
        rateBasedStatement: {
          limit: 100,
          aggregateKeyType: 'IP',
          scopeDownStatement: {
            byteMatchStatement: {
              searchString: 'checkInviteKey',
              fieldToMatch: { body: { oversizeHandling: 'MATCH' } },
              textTransformations: [{ priority: 0, type: 'NONE' }],
              positionalConstraint: 'CONTAINS',
            },
          },
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'tarotSpaApiRateLimit',
      },
    },
    {
      name: 'RateLimitRequestAccessPerIp',
      priority: 1,
      action: { block: {} },
      statement: {
        rateBasedStatement: {
          limit: 100,
          aggregateKeyType: 'IP',
          scopeDownStatement: {
            byteMatchStatement: {
              searchString: 'requestAccess',
              fieldToMatch: { body: { oversizeHandling: 'MATCH' } },
              textTransformations: [{ priority: 0, type: 'NONE' }],
              positionalConstraint: 'CONTAINS',
            },
          },
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'tarotSpaRequestAccessRateLimit',
      },
    },
    {
      name: 'RateLimitStartOrientationGuidePerIp',
      priority: 2,
      action: { block: {} },
      statement: {
        rateBasedStatement: {
          limit: 100,
          aggregateKeyType: 'IP',
          scopeDownStatement: {
            byteMatchStatement: {
              searchString: 'startOrientationGuide',
              fieldToMatch: { body: { oversizeHandling: 'MATCH' } },
              textTransformations: [{ priority: 0, type: 'NONE' }],
              positionalConstraint: 'CONTAINS',
            },
          },
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'tarotSpaStartOrientationGuideRateLimit',
      },
    },
  ],
});

new CfnWebACLAssociation(dataStack, 'ApiRateLimitAssociation', {
  resourceArn: backend.data.resources.graphqlApi.arn,
  webAclArn: inviteKeyRateLimit.attrArn,
});
