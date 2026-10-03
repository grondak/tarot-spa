import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

// <env-name> is the Amplify backend name: your sandbox identifier (e.g. `tonyreynolds`,
// shown in the `npx ampx sandbox` banner) or a branch environment name (`staging`, `main`).
// The real table name is resolved from the SSM parameter backend.ts publishes at
// /<namespace>/<env-name>/invite-key-table-name.
//
// <namespace> defaults to 'tarot-spa' (the project name), which is correct for a personal
// sandbox — Amplify's sandbox CLI namespaces by project name. It is NOT correct for a Git-
// connected branch deployment (staging/main): there, Amplify's pipeline-deploy namespaces by
// the Amplify App ID instead (confirmed in @aws-amplify/backend-cli's pipeline_deploy_command.js:
// `{ namespace: args.appId, name: args.branch }`). For a branch environment, pass the App ID
// explicitly with --app-id=<id> (Console → App settings, or the console URL's /apps/<id>/ segment).
const rawArgs = process.argv.slice(2);
const appIdArg = rawArgs.find((arg) => arg.startsWith('--app-id='));
const namespace = appIdArg ? appIdArg.slice('--app-id='.length) : 'tarot-spa';
const [envName, code = 'FIRST-GEN-TEST'] = rawArgs.filter((arg) => !arg.startsWith('--'));

if (!envName) {
  console.error('Usage: npm run seed-invite-key -- <env-name> [code] [--app-id=<id>]');
  console.error('  --app-id is required for a branch environment (staging/main); omit it for your personal sandbox.');
  process.exit(1);
}

const ssm = new SSMClient({});
const paramName = `/${namespace}/${envName}/invite-key-table-name`;

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
