import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

// <env-name> is the Amplify backend name: your sandbox identifier (e.g. `tonyreynolds`,
// shown in the `npx ampx sandbox` banner) or a branch environment name (`staging`, `main`).
// The real table name is resolved from the SSM parameter backend.ts publishes at
// /<namespace>/<env-name>/config-table-name.
//
// <namespace> defaults to 'tarot-spa' (correct for a personal sandbox). A Git-connected branch
// deployment (staging/main) namespaces by Amplify App ID instead — pass --app-id=<id> for those
// (Console → App settings, or the console URL's /apps/<id>/ segment).
const rawArgs = process.argv.slice(2);
const appIdArg = rawArgs.find((arg) => arg.startsWith('--app-id='));
const namespace = appIdArg ? appIdArg.slice('--app-id='.length) : 'tarot-spa';
const envName = rawArgs.find((arg) => !arg.startsWith('--'));

if (!envName) {
  console.error('Usage: npm run seed-config -- <env-name> [--app-id=<id>]');
  console.error('  --app-id is required for a branch environment (staging/main); omit it for your personal sandbox.');
  process.exit(1);
}

const ssm = new SSMClient({});
const paramName = `/${namespace}/${envName}/config-table-name`;

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
