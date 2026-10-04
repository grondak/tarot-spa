import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  SCRUBBED_CONTEXT_PLACEHOLDER,
  SCRUBBED_GUIDE_PLACEHOLDER,
  SESSION_RETENTION_DAYS,
} from '../amplify/config.ts';

// One-shot catch-up for Session rows that predate the session-scrubber Lambda
// and the expiresAt (TTL) attribute: those rows have no expiresAt at all, so
// they're invisible to both TTL deletion and session-scrubber's own
// `expiresAt <= now` scan filter. This script finds any row old enough per
// SESSION_RETENTION_DAYS (by createdAt, which every row has), scrubs it the
// same way session-scrubber does, and backfills expiresAt so TTL can take it
// from there. Safe to run repeatedly, and safe to run after session-scrubber
// is live — rows it already scrubbed are skipped via the same
// attribute_not_exists(scrubbedAt) condition.
//
// <env-name> is the Amplify backend name: your sandbox identifier (e.g. `tonyreynolds`,
// shown in the `npx ampx sandbox` banner) or a branch environment name (`staging`, `main`).
// The real table name is resolved from the SSM parameter backend.ts publishes at
// /<namespace>/<env-name>/session-table-name.
//
// <namespace> defaults to 'tarot-spa' (correct for a personal sandbox). A Git-connected branch
// deployment (staging/main) namespaces by Amplify App ID instead — pass --app-id=<id> for those
// (Console → App settings, or the console URL's /apps/<id>/ segment).
const rawArgs = process.argv.slice(2);
const appIdArg = rawArgs.find((arg) => arg.startsWith('--app-id='));
const namespace = appIdArg ? appIdArg.slice('--app-id='.length) : 'tarot-spa';
const envName = rawArgs.find((arg) => !arg.startsWith('--'));

if (!envName) {
  console.error('Usage: npm run scrub-old-sessions -- <env-name> [--app-id=<id>]');
  console.error('  --app-id is required for a branch environment (staging/main); omit it for your personal sandbox.');
  process.exit(1);
}

const ssm = new SSMClient({});
const paramName = `/${namespace}/${envName}/session-table-name`;

let tableName;
try {
  const result = await ssm.send(new GetParameterCommand({ Name: paramName }));
  tableName = result.Parameter?.Value;
} catch {
  console.error(`Could not read ${paramName} — is the '${envName}' environment deployed?`);
  process.exit(1);
}

if (!tableName) {
  console.error(`${paramName} has no table name value.`);
  process.exit(1);
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cutoffMs = Date.now() - SESSION_RETENTION_DAYS * 86_400_000;
let exclusiveStartKey;
let scanned = 0;
let scrubbed = 0;
let skippedNotOldEnough = 0;
let skippedAlreadyScrubbed = 0;

do {
  const page = await dynamo.send(new ScanCommand({
    TableName: tableName,
    ExclusiveStartKey: exclusiveStartKey,
    ProjectionExpression: 'id, createdAt',
  }));
  scanned += page.ScannedCount ?? 0;

  for (const item of page.Items ?? []) {
    if (typeof item.id !== 'string' || typeof item.createdAt !== 'string') {
      throw new Error('Legacy Session is missing id or createdAt; no data was changed for that row.');
    }

    const createdAtMs = Date.parse(item.createdAt);
    if (createdAtMs > cutoffMs) {
      skippedNotOldEnough += 1;
      continue;
    }

    const timestamp = new Date().toISOString();
    const expiresAt = Math.floor(createdAtMs / 1000) + SESSION_RETENTION_DAYS * 86_400;

    try {
      await dynamo.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: item.id },
        ConditionExpression: 'attribute_not_exists(scrubbedAt)',
        UpdateExpression: 'SET context = :context, guide = :guide, scrubbedAt = :timestamp, updatedAt = :timestamp, expiresAt = :expiresAt',
        ExpressionAttributeValues: {
          ':context': SCRUBBED_CONTEXT_PLACEHOLDER,
          ':guide': SCRUBBED_GUIDE_PLACEHOLDER,
          ':timestamp': timestamp,
          ':expiresAt': expiresAt,
        },
      }));
      scrubbed += 1;
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
      skippedAlreadyScrubbed += 1;
    }
  }

  exclusiveStartKey = page.LastEvaluatedKey;
} while (exclusiveStartKey);

console.log(
  `Scrub complete for ${tableName}: scanned ${scanned}, scrubbed ${scrubbed}, `
  + `skipped (not old enough) ${skippedNotOldEnough}, skipped (already scrubbed) ${skippedAlreadyScrubbed}.`,
);
