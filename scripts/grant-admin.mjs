import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { readFile } from 'node:fs/promises';

const [email] = process.argv.slice(2);

if (!email) {
  console.error('Usage: npm run grant-admin -- <email>');
  process.exit(1);
}

let outputs;
try {
  outputs = JSON.parse(
    await readFile(new URL('../amplify_outputs.json', import.meta.url), 'utf8'),
  );
} catch {
  console.error('Could not read amplify_outputs.json — deploy the environment first.');
  process.exit(1);
}

const userPoolId = outputs.auth?.user_pool_id;
const region = outputs.auth?.aws_region;
if (!userPoolId || !region) {
  console.error('amplify_outputs.json is missing auth User Pool configuration.');
  process.exit(1);
}

const cognito = new CognitoIdentityProviderClient({ region });
await cognito.send(new AdminAddUserToGroupCommand({
  UserPoolId: userPoolId,
  Username: email,
  GroupName: 'Admin',
}));

console.log(`Granted Admin membership to '${email}' in ${userPoolId}`);
