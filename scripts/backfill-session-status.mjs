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
// /tarot-spa/<env-name>/session-table-name.
const [envName] = process.argv.slice(2);

if (!envName) {
  console.error('Usage: npm run backfill-sessions -- <env-name>');
  process.exit(1);
}

const ssm = new SSMClient({});
const paramName = `/tarot-spa/${envName}/session-table-name`;

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
