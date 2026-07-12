import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

// <env-name> is the Amplify backend name: your sandbox identifier (e.g. `tonyreynolds`,
// shown in the `npx ampx sandbox` banner) or a branch environment name (`staging`, `main`).
// The real table name is resolved from the SSM parameter backend.ts publishes at
// /tarot-spa/<env-name>/invite-key-table-name.
const [envName, code = 'FIRST-GEN-TEST'] = process.argv.slice(2);

if (!envName) {
  console.error('Usage: npm run seed-invite-key -- <env-name> [code]');
  process.exit(1);
}

const ssm = new SSMClient({});
const paramName = `/tarot-spa/${envName}/invite-key-table-name`;

let tableName;
try {
  const result = await ssm.send(new GetParameterCommand({ Name: paramName }));
  tableName = result.Parameter?.Value;
} catch {
  console.error(`Could not read ${paramName} — is the '${envName}' environment deployed?`);
  process.exit(1);
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

try {
  await dynamo.send(new PutCommand({
    TableName: tableName,
    Item: {
      id: code,
      status: 'unredeemed',
      generation: 'FirstGen',
    },
    ConditionExpression: 'attribute_not_exists(id)',
  }));
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    console.error(`Invite key '${code}' already exists in ${tableName} — not overwritten.`);
    process.exit(1);
  }
  throw error;
}

console.log(`Seeded unredeemed FirstGen InviteKey '${code}' into ${tableName}`);
