import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

// Read-only health check for an environment's Observation Window backend. Run it after a deploy
// and again after the collector has had a few hours. It changes nothing.
//
//   npm run smoke-observation -- <env-name> [--app-id=<id>]
//
// <env-name> and --app-id work as in import-observation-history: a sandbox identifier alone, or a
// branch name with the Amplify App ID (d3l9xh49fqq1ce for staging and main).
const rawArgs = process.argv.slice(2);
const appIdArg = rawArgs.find((arg) => arg.startsWith('--app-id='));
const namespace = appIdArg ? appIdArg.slice('--app-id='.length) : 'tarot-spa';
const envName = rawArgs.find((arg) => !arg.startsWith('--'));
if (!envName) {
  console.error('Usage: npm run smoke-observation -- <env-name> [--app-id=<id>]');
  process.exit(1);
}

const HOUR = 3600e3;
const ssm = new SSMClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});
let failures = 0;

function report(ok, label, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

async function param(suffix) {
  try {
    const result = await ssm.send(new GetParameterCommand({ Name: `/${namespace}/${envName}/${suffix}` }));
    return result.Parameter?.Value;
  } catch {
    return undefined;
  }
}

async function scanAll(TableName, names) {
  const rows = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(new ScanCommand({
      TableName,
      ProjectionExpression: Object.keys(names).join(', '),
      ExpressionAttributeNames: Object.fromEntries(Object.entries(names).map(([alias, name]) => [alias, name])),
      ExclusiveStartKey,
    }));
    rows.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return rows;
}

const feedTable = await param('feed-table-name');
const itemTable = await param('feed-item-table-name');
const runTable = await param('collector-run-table-name');
const widenName = await param('widen-search-function-name');
report(Boolean(feedTable && itemTable && runTable), 'tables are published to SSM', `${namespace}/${envName}`);
report(Boolean(widenName), 'widen-search function name is published to SSM');
if (!feedTable || !itemTable || !runTable) process.exit(1);

const now = Date.now();

const runs = await scanAll(runTable, { '#s': 'startedAt', '#ok': 'feedsOk', '#t': 'feedsTotal' });
const latest = runs.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
if (latest) {
  const ageH = (now - Date.parse(latest.startedAt)) / HOUR;
  report(ageH < 3, 'collector ran in the last 3 hours', `${ageH.toFixed(1)} h ago, ${runs.length} runs kept`);
  report(latest.feedsOk * 2 > latest.feedsTotal, 'latest run fetched most feeds', `${latest.feedsOk} of ${latest.feedsTotal}`);
  const sorted = runs.map((r) => Date.parse(r.startedAt)).sort((a, b) => a - b);
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > 2.5 * HOUR) gaps += 1;
  console.log(`INFO  ${gaps} gap${gaps === 1 ? '' : 's'} longer than 2.5 h between runs`);
} else {
  report(false, 'collector has run at least once');
}

const feeds = await scanAll(feedTable, { '#i': 'id', '#k': 'kind', '#st': 'lastStatus' });
const pool = feeds.filter((f) => f.kind === 'pool');
const starter = feeds.filter((f) => f.kind === 'starter');
report(pool.length >= 5, 'outside-interest pool is collected', `${pool.length} pool feeds`);
report(starter.length >= 15, 'starter feeds are collected', `${starter.length} feeds`);
const failing = feeds.filter((f) => f.lastStatus === 'error').map((f) => f.id);
console.log(`INFO  ${failing.length} feed${failing.length === 1 ? '' : 's'} failing now${failing.length ? `: ${failing.join(', ')}` : ''}`);

const items = await scanAll(itemTable, { '#p': 'publishedAt', '#e': 'expiresAt' });
const recent = items.filter((i) => now - Date.parse(i.publishedAt) < 24 * HOUR).length;
report(items.length > 0, 'items are stored', `${items.length} items`);
report(recent > 0, 'items arrived in the last 24 hours', `${recent} items`);
const expiring = items.filter((i) => typeof i.expiresAt === 'number').length;
report(expiring === items.length, 'every item has an expiry (30-day TTL)', `${expiring} of ${items.length}`);

if (widenName) {
  try {
    const result = await lambda.send(new InvokeCommand({
      FunctionName: widenName,
      Payload: JSON.stringify({ arguments: { term: 'war' } }),
    }));
    const body = JSON.parse(new TextDecoder().decode(result.Payload));
    report(!result.FunctionError && body.synonyms?.includes('warfare'), 'widen-search answers', `war -> ${body.synonyms?.join(', ')}`);
  } catch (error) {
    report(false, 'widen-search answers', error.message);
  }
}

console.log(failures ? `\n${failures} check${failures === 1 ? '' : 's'} failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
