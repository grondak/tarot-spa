import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

// <env-name> is the Amplify backend name: your sandbox identifier (e.g. `tonyreynolds`,
// shown in the `npx ampx sandbox` banner) or a branch environment name (`staging`, `main`).
// The real table name is resolved from the SSM parameter backend.ts publishes at
// /tarot-spa/<env-name>/config-table-name.
const [envName] = process.argv.slice(2);

if (!envName) {
  console.error('Usage: npm run seed-config -- <env-name>');
  process.exit(1);
}

const ssm = new SSMClient({});
const paramName = `/tarot-spa/${envName}/config-table-name`;

let tableName;
try {
  const result = await ssm.send(new GetParameterCommand({ Name: paramName }));
  tableName = result.Parameter?.Value;
} catch {
  console.error(`Could not read ${paramName} — is the '${envName}' environment deployed?`);
  process.exit(1);
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const timestamp = new Date().toISOString();

try {
  await dynamo.send(new PutCommand({
    TableName: tableName,
    Item: {
      id: 'global',
      dailyLimit: 5,
      monthlyBudget: 30,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    ConditionExpression: 'attribute_not_exists(id)',
  }));
  console.log(`Seeded Config 'global' into ${tableName}`);
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    console.log(`Config 'global' already exists in ${tableName} — not overwritten.`);
  } else {
    throw error;
  }
}
