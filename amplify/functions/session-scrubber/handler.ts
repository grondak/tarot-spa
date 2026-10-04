import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  SCRUBBED_CONTEXT_PLACEHOLDER,
  SCRUBBED_GUIDE_PLACEHOLDER,
} from '../../config';
import { isErrorNamed } from '../usage-counter/reservation';

type CommandClient = {
  send(command: unknown): Promise<unknown>;
};

type ScrubCandidate = {
  id?: string;
};

type Dependencies = {
  dynamo: CommandClient;
  sessionTableName: string;
  now: () => Date;
};

type ScrubResult = {
  inspected: number;
  scrubbed: number;
};

const defaultDependencies: Dependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  sessionTableName: process.env.SESSION_TABLE_NAME ?? '',
  now: () => new Date(),
};

async function scrubSession(deps: Dependencies, sessionId: string, timestamp: string) {
  try {
    await deps.dynamo.send(new UpdateCommand({
      TableName: deps.sessionTableName,
      Key: { id: sessionId },
      ConditionExpression: 'attribute_not_exists(scrubbedAt)',
      UpdateExpression: 'SET context = :context, guide = :guide, scrubbedAt = :timestamp, updatedAt = :timestamp',
      ExpressionAttributeValues: {
        ':context': SCRUBBED_CONTEXT_PLACEHOLDER,
        ':guide': SCRUBBED_GUIDE_PLACEHOLDER,
        ':timestamp': timestamp,
      },
    }));
    return true;
  } catch (error) {
    // Another concurrent run (or the one-shot backfill script) already scrubbed this row.
    if (isErrorNamed(error, 'ConditionalCheckFailedException')) return false;
    throw error;
  }
}

export function createHandler(deps: Dependencies = defaultDependencies) {
  return async (): Promise<ScrubResult> => {
    if (!deps.sessionTableName) {
      throw new Error('session-scrubber configuration is missing');
    }

    const now = deps.now();
    const timestamp = now.toISOString();
    const nowEpochSeconds = Math.floor(now.getTime() / 1000);
    const result: ScrubResult = { inspected: 0, scrubbed: 0 };
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const page = await deps.dynamo.send(new ScanCommand({
        TableName: deps.sessionTableName,
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
        FilterExpression: 'expiresAt <= :now AND attribute_not_exists(scrubbedAt)',
        ProjectionExpression: 'id',
        ExpressionAttributeValues: { ':now': nowEpochSeconds },
      })) as {
        Items?: ScrubCandidate[];
        LastEvaluatedKey?: Record<string, unknown>;
      };

      for (const session of page.Items ?? []) {
        if (!session.id) continue;
        result.inspected += 1;
        if (await scrubSession(deps, session.id, timestamp)) result.scrubbed += 1;
      }

      exclusiveStartKey = page.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return result;
  };
}

export const handler = createHandler();
