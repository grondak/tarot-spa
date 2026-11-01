// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Same approach as resource.test.ts: Amplify Gen 2 exposes no stable runtime API for reading a
// model's authorization back, so this is a source contract test over the model blocks and the
// backend wiring. Each assertion is chosen to fail against a specific wrong edit.
const resourceSource = readFileSync(resolve(import.meta.dirname, './resource.ts'), 'utf8');
const backendSource = readFileSync(resolve(import.meta.dirname, '../backend.ts'), 'utf8');

function modelBlock(modelName: string) {
  const header = new RegExp(`\\n\\s*${modelName}:\\s*a\\n`).exec(resourceSource);
  if (!header) throw new Error(`${modelName} model not found`);
  const next = /\n\s*(?:\/\/[^\n]*\n\s*)*[A-Za-z]+:\s*a\n/g;
  next.lastIndex = header.index + header[0].length;
  const end = next.exec(resourceSource);
  return resourceSource.slice(header.index, end ? end.index : undefined);
}

describe('Observation Window models', () => {
  for (const name of ['Feed', 'FeedItem', 'FeedDailyCount', 'CollectorRun']) {
    it(`${name} is readable by signed-in users and writable by no browser principal`, () => {
      const block = modelBlock(name);

      expect(block).toContain(".authorization((allow) => [allow.authenticated().to(['read'])])");
      expect(block).not.toMatch(/allow\.owner|allow\.publicApiKey|allow\.guest|allow\.group/);
    });
  }

  it('FeedDailyCount is keyed by feed and day', () => {
    expect(modelBlock('FeedDailyCount')).toContain(".identifier(['feedId', 'day'])");
  });

  it('keeps nothing per user on any of the four models', () => {
    for (const name of ['Feed', 'FeedItem', 'FeedDailyCount', 'CollectorRun']) {
      expect(modelBlock(name)).not.toMatch(/\bowner\b|\buserId\b|\bsub\b/);
    }
  });
});

describe('Observation Window backend wiring', () => {
  it('expires collected items and run logs by TTL on expiresAt', () => {
    for (const table of ['FeedItem', 'CollectorRun']) {
      const pattern = new RegExp(`amplifyDynamoDbTables\\.${table}\\.timeToLiveAttribute = \\{\\s*attributeName: 'expiresAt',\\s*enabled: true,`);
      expect(backendSource).toMatch(pattern);
    }
  });

  it('gives the collector only the writes it needs, and no reads', () => {
    expect(backendSource).toContain("feedTable.grant(feedCollectorLambda, 'dynamodb:UpdateItem');");
    expect(backendSource).toContain("feedItemTable.grant(feedCollectorLambda, 'dynamodb:PutItem', 'dynamodb:UpdateItem');");
    expect(backendSource).toContain("feedDailyCountTable.grant(feedCollectorLambda, 'dynamodb:UpdateItem');");
    expect(backendSource).toContain("collectorRunTable.grant(feedCollectorLambda, 'dynamodb:PutItem');");
    expect(backendSource).not.toMatch(/(feedTable|feedItemTable|feedDailyCountTable|collectorRunTable)\.grant(Read|ReadWrite|Write|Full)\w*\(feedCollectorLambda/);
  });

  it('runs the collector hourly and alarms on errors and on silence', () => {
    expect(backendSource).toMatch(/'FeedCollectorSchedule',\s*\{ schedule: Schedule\.rate\(Duration\.hours\(1\)\) \}/);
    expect(backendSource).toContain("feedCollectorErrorAlarm.addAlarmAction(new SnsAction(workerFailureTopic));");
    expect(backendSource).toContain("feedCollectorMissedInvocationAlarm.addAlarmAction(new SnsAction(workerFailureTopic));");
  });

  it('alarms when widen-search errors, and gives it no table access', () => {
    expect(backendSource).toContain('WidenSearchLambdaErrorAlarm');
    expect(backendSource).toMatch(/widenSearchErrorAlarm\.addAlarmAction\(new SnsAction\(workerFailureTopic\)\)/);
    expect(backendSource).not.toMatch(/grant[A-Za-z]*\([^)]*widenSearchLambda/);
    expect(backendSource).not.toMatch(/Table\.grant\(widenSearchLambda/);
  });
});
