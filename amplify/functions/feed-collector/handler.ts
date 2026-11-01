import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { COLLECTOR_RUN_RETENTION_DAYS, FEED_ITEM_RETENTION_DAYS } from '../../config';
import { STARTER_FEEDS, type FeedDefinition } from '../../feeds';
import { isErrorNamed } from '../usage-counter/reservation';
import { parseFeed, type ParsedItem } from './parse';

type CommandClient = {
  send(command: unknown): Promise<unknown>;
};

type Dependencies = {
  dynamo: CommandClient;
  fetchFn: typeof fetch;
  tableNames: {
    feed: string;
    feedItem: string;
    feedDailyCount: string;
    collectorRun: string;
  };
  feeds: readonly FeedDefinition[];
  now: () => Date;
};

export type FeedResult = {
  feedId: string;
  status: 'ok' | 'error';
  seen: number;
  added: number;
  error?: string;
};

export type CollectorSummary = {
  feedsOk: number;
  feedsTotal: number;
  added: number;
};

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BODY_CHARACTERS = 5_000_000;
const CONCURRENCY = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (compatible; OODADSS Observation Window collector)';

const defaultDependencies: Dependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  fetchFn: fetch,
  tableNames: {
    feed: process.env.FEED_TABLE_NAME ?? '',
    feedItem: process.env.FEED_ITEM_TABLE_NAME ?? '',
    feedDailyCount: process.env.FEED_DAILY_COUNT_TABLE_NAME ?? '',
    collectorRun: process.env.COLLECTOR_RUN_TABLE_NAME ?? '',
  },
  feeds: STARTER_FEEDS,
  now: () => new Date(),
};

async function mapWithLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchItems(deps: Dependencies, feed: FeedDefinition, fetchedAt: string) {
  const response = await deps.fetchFn(feed.url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > MAX_BODY_CHARACTERS) throw new Error('feed is larger than expected');
  return parseFeed(body, fetchedAt);
}

function isConditionalCancellation(error: unknown) {
  if (!isErrorNamed(error, 'TransactionCanceledException')) return false;
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
  return reasons.some((reason) => reason?.Code === 'ConditionalCheckFailed');
}

// Stores one item. A new item is written together with its daily count in one transaction, so a
// count is neither missed nor doubled if a run is retried. An item already stored (an earlier run,
// or the same story from another feed) only gets this feed added to its sources.
async function storeItem(
  deps: Dependencies,
  feed: FeedDefinition,
  item: ParsedItem,
  fetchedAt: string,
  expiresAt: number,
) {
  const day = item.publishedAt.slice(0, 10);
  try {
    await deps.dynamo.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: deps.tableNames.feedItem,
            Item: {
              id: item.id,
              title: item.title,
              link: item.link,
              summary: item.summary,
              publishedAt: item.publishedAt,
              publishedAtEstimated: item.publishedAtEstimated,
              sources: [feed.id],
              fetchedAt,
              expiresAt,
              createdAt: fetchedAt,
              updatedAt: fetchedAt,
            },
            ConditionExpression: 'attribute_not_exists(id)',
          },
        },
        {
          Update: {
            TableName: deps.tableNames.feedDailyCount,
            Key: { feedId: feed.id, day },
            UpdateExpression: 'SET createdAt = if_not_exists(createdAt, :ts), updatedAt = :ts, #count = if_not_exists(#count, :zero) + :one',
            ExpressionAttributeNames: { '#count': 'count' },
            ExpressionAttributeValues: { ':ts': fetchedAt, ':zero': 0, ':one': 1 },
          },
        },
      ],
    }));
    return true;
  } catch (error) {
    if (!isConditionalCancellation(error)) throw error;
  }

  try {
    await deps.dynamo.send(new UpdateCommand({
      TableName: deps.tableNames.feedItem,
      Key: { id: item.id },
      UpdateExpression: 'SET sources = list_append(sources, :feed), updatedAt = :ts',
      ConditionExpression: 'NOT contains(sources, :feedId)',
      ExpressionAttributeValues: { ':feed': [feed.id], ':feedId': feed.id, ':ts': fetchedAt },
    }));
  } catch (error) {
    // This feed is already listed as a source of the item.
    if (!isErrorNamed(error, 'ConditionalCheckFailedException')) throw error;
  }
  return false;
}

async function recordFeedStatus(
  deps: Dependencies,
  feed: FeedDefinition,
  sortOrder: number,
  result: FeedResult,
  timestamp: string,
) {
  await deps.dynamo.send(new UpdateCommand({
    TableName: deps.tableNames.feed,
    Key: { id: feed.id },
    UpdateExpression: `SET #name = :name, #group = :group, #url = :url, sortOrder = :sortOrder, lastFetchedAt = :ts, lastStatus = :status, createdAt = if_not_exists(createdAt, :ts), updatedAt = :ts${result.error ? ', lastError = :error' : ' REMOVE lastError'}`,
    ExpressionAttributeNames: { '#name': 'name', '#group': 'group', '#url': 'url' },
    ExpressionAttributeValues: {
      ':name': feed.name,
      ':group': feed.group,
      ':url': feed.url,
      ':sortOrder': sortOrder,
      ':ts': timestamp,
      ':status': result.status,
      ...(result.error ? { ':error': result.error } : {}),
    },
  }));
}

async function collectFeed(deps: Dependencies, feed: FeedDefinition, sortOrder: number): Promise<FeedResult> {
  const result: FeedResult = { feedId: feed.id, status: 'ok', seen: 0, added: 0 };
  const nowMs = deps.now().getTime();
  const fetchedAt = new Date(nowMs).toISOString();
  const cutoffMs = nowMs - FEED_ITEM_RETENTION_DAYS * DAY_MS;
  try {
    const items = await fetchItems(deps, feed, fetchedAt);
    for (const parsed of items) {
      result.seen += 1;
      // A date far in the future would outlive the retention window; treat it as undated.
      const item = Date.parse(parsed.publishedAt) > nowMs + DAY_MS
        ? { ...parsed, publishedAt: fetchedAt, publishedAtEstimated: true }
        : parsed;
      const publishedMs = Date.parse(item.publishedAt);
      if (publishedMs < cutoffMs) continue;
      const expiresAt = Math.floor((publishedMs + FEED_ITEM_RETENTION_DAYS * DAY_MS) / 1000);
      if (await storeItem(deps, feed, item, fetchedAt, expiresAt)) result.added += 1;
    }
  } catch (error) {
    result.status = 'error';
    result.error = error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
  }
  try {
    await recordFeedStatus(deps, feed, sortOrder, result, fetchedAt);
  } catch (error) {
    if (result.status === 'ok') {
      result.status = 'error';
      result.error = `could not record feed status: ${error instanceof Error ? error.message.slice(0, 150) : 'unknown error'}`;
    }
  }
  return result;
}

export function createHandler(deps: Dependencies = defaultDependencies) {
  return async (): Promise<CollectorSummary> => {
    if (Object.values(deps.tableNames).some((name) => !name)) {
      throw new Error('feed-collector configuration is missing');
    }

    const startedAt = deps.now();
    const results = await mapWithLimit(deps.feeds, CONCURRENCY, (feed, index) => collectFeed(deps, feed, index));
    const finishedAt = deps.now();
    const summary: CollectorSummary = {
      feedsOk: results.filter((r) => r.status === 'ok').length,
      feedsTotal: results.length,
      added: results.reduce((sum, r) => sum + r.added, 0),
    };

    // The run log is how the Window tells a collector outage from a quiet day (epic S9.7).
    await deps.dynamo.send(new PutCommand({
      TableName: deps.tableNames.collectorRun,
      Item: {
        id: startedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        feedsOk: summary.feedsOk,
        feedsTotal: summary.feedsTotal,
        added: summary.added,
        results: JSON.stringify(results),
        expiresAt: Math.floor(finishedAt.getTime() / 1000) + COLLECTOR_RUN_RETENTION_DAYS * 86400,
        createdAt: startedAt.toISOString(),
        updatedAt: finishedAt.toISOString(),
      },
    }));

    // Counts only: nothing from the feeds themselves goes to the logs.
    console.log(JSON.stringify({ event: 'feed-collector-run', ...summary }));

    // Most feeds failing means a network or provider problem rather than one broken feed.
    // Fail the invocation so the error alarm pages; the run above is already recorded.
    if (summary.feedsOk * 2 < summary.feedsTotal) {
      throw new Error(`feed-collector: only ${summary.feedsOk} of ${summary.feedsTotal} feeds succeeded`);
    }
    return summary;
  };
}

export const handler = createHandler();
