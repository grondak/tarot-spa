import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

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
  console.error('Usage: npm run backfill-sessions -- <env-name> [--app-id=<id>]');
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
let exclusiveStartKey;
let scanned = 0;
let updated = 0;

do {
  const page = await dynamo.send(new ScanCommand({
    TableName: tableName,
    ExclusiveStartKey: exclusiveStartKey,
    FilterExpression: 'attribute_not_exists(#s)',
    ProjectionExpression: 'id, updatedAt',
    ExpressionAttributeNames: { '#s': 'status' },
  }));
  scanned += page.ScannedCount ?? 0;

  for (const item of page.Items ?? []) {
    if (typeof item.id !== 'string' || typeof item.updatedAt !== 'string') {
      throw new Error('Legacy Session is missing id or updatedAt; no data was changed for that row.');
    }

    try {
      await dynamo.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: item.id },
        ConditionExpression: 'attribute_not_exists(#s)',
        UpdateExpression: 'SET #s = :succeeded, completedAt = :completedAt',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':succeeded': 'SUCCEEDED',
          ':completedAt': item.updatedAt,
        },
      }));
      updated += 1;
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
    }
  }

  exclusiveStartKey = page.LastEvaluatedKey;
} while (exclusiveStartKey);

console.log(`Backfill complete for ${tableName}: scanned ${scanned}, updated ${updated}.`);
