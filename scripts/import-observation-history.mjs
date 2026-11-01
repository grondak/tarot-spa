import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

// One-off: copies the laptop prototype's collected history (prototype/observation-window/data)
// into an environment's shared feed store, so a month of collection is not lost when the cloud
// collector takes over. Safe to re-run: items already stored are left alone, and a daily count is
// only raised, never lowered.
//
// <env-name> is the Amplify backend name: your sandbox identifier (e.g. `tonyreynolds`) or a branch
// environment name. Table names are resolved from the SSM parameters backend.ts publishes at
// /<namespace>/<env-name>/feed-item-table-name and /feed-daily-count-table-name.
// <namespace> defaults to 'tarot-spa' (a personal sandbox); pass --app-id=<id> for staging/main.
const rawArgs = process.argv.slice(2);
const appIdArg = rawArgs.find((arg) => arg.startsWith('--app-id='));
const fromArg = rawArgs.find((arg) => arg.startsWith('--from='));
const dryRun = rawArgs.includes('--dry-run');
const namespace = appIdArg ? appIdArg.slice('--app-id='.length) : 'tarot-spa';
const envName = rawArgs.find((arg) => !arg.startsWith('--'));
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = fromArg
  ? resolve(fromArg.slice('--from='.length))
  : join(here, '..', 'prototype', 'observation-window', 'data');

if (!envName) {
  console.error('Usage: npm run import-observation-history -- <env-name> [--app-id=<id>] [--from=<dir>] [--dry-run]');
  console.error('  --app-id is required for a branch environment (staging/main); omit it for your personal sandbox.');
  console.error('  --dry-run reads everything and reports what would be written, without writing.');
  process.exit(1);
}

// Must match amplify/config.ts FEED_ITEM_RETENTION_DAYS.
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Same decoding as amplify/functions/feed-collector/parse.ts, so imported text matches collected text.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#')) {
      const hex = entity[1].toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

async function readJson(name) {
  try {
    return JSON.parse(await readFile(join(dataDir, name), 'utf8'));
  } catch (error) {
    console.error(`Could not read ${join(dataDir, name)}: ${error.message}`);
    process.exit(1);
  }
}

async function tableNameFor(ssm, suffix) {
  const paramName = `/${namespace}/${envName}/${suffix}`;
  try {
    const result = await ssm.send(new GetParameterCommand({ Name: paramName }));
    return result.Parameter?.Value;
  } catch {
    console.error(`Could not read ${paramName} — is the '${envName}' environment deployed with the Observation Window tables?`);
    process.exit(1);
  }
}

const items = await readJson('items.json');
const counts = await readJson('counts.json');
const nowMs = Date.now();
const timestamp = new Date(nowMs).toISOString();
const cutoffMs = nowMs - RETENTION_DAYS * DAY_MS;

const itemRows = [];
let skippedOld = 0;
for (const [key, item] of Object.entries(items)) {
  const publishedMs = Date.parse(item.publishedAt);
  if (Number.isNaN(publishedMs) || publishedMs < cutoffMs) {
    skippedOld += 1;
    continue;
  }
  itemRows.push({
    id: createHash('sha256').update(key).digest('hex').slice(0, 32),
    title: decodeEntities(item.title ?? ''),
    link: item.link || key,
    summary: decodeEntities(item.summary ?? ''),
    publishedAt: item.publishedAt,
    publishedAtEstimated: Boolean(item.publishedAtEstimated),
    sources: item.sources,
    fetchedAt: item.fetchedAt ?? timestamp,
    expiresAt: Math.floor((publishedMs + RETENTION_DAYS * DAY_MS) / 1000),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

const countRows = Object.entries(counts).flatMap(([feedId, days]) => (
  Object.entries(days).map(([day, count]) => ({ feedId, day, count }))
));

console.log(`Read ${Object.keys(items).length} items (${itemRows.length} within ${RETENTION_DAYS} days, ${skippedOld} older) and ${countRows.length} daily counts from ${dataDir}`);

if (dryRun) {
  console.log(`Dry run: would write up to ${itemRows.length} items and ${countRows.length} daily counts to '${envName}'. Nothing written.`);
  process.exit(0);
}

const ssm = new SSMClient({});
const feedItemTable = await tableNameFor(ssm, 'feed-item-table-name');
const feedDailyCountTable = await tableNameFor(ssm, 'feed-daily-count-table-name');
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

let importedItems = 0;
let existingItems = 0;
for (const row of itemRows) {
  try {
    await dynamo.send(new PutCommand({
      TableName: feedItemTable,
      Item: row,
      ConditionExpression: 'attribute_not_exists(id)',
    }));
    importedItems += 1;
  } catch (error) {
    if (error.name !== 'ConditionalCheckFailedException') throw error;
    existingItems += 1;
  }
}

let raisedCounts = 0;
let keptCounts = 0;
for (const { feedId, day, count } of countRows) {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: feedDailyCountTable,
      Key: { feedId, day },
      UpdateExpression: 'SET createdAt = if_not_exists(createdAt, :ts), updatedAt = :ts, #count = :n',
      ConditionExpression: 'attribute_not_exists(#count) OR #count < :n',
      ExpressionAttributeNames: { '#count': 'count' },
      ExpressionAttributeValues: { ':ts': timestamp, ':n': count },
    }));
    raisedCounts += 1;
  } catch (error) {
    if (error.name !== 'ConditionalCheckFailedException') throw error;
    keptCounts += 1;
  }
}

console.log(`Items: ${importedItems} imported, ${existingItems} already there (into ${feedItemTable}).`);
console.log(`Daily counts: ${raisedCounts} written or raised, ${keptCounts} already as high or higher (into ${feedDailyCountTable}).`);
