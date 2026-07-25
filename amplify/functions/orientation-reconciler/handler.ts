import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  InvokeCommand,
  LambdaClient,
  ListDurableExecutionsByFunctionCommand,
  type Execution,
} from '@aws-sdk/client-lambda';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { isErrorNamed } from '../usage-counter/reservation';

type CommandClient = {
  send(command: unknown): Promise<unknown>;
};

type PendingSession = {
  id?: string;
};

type Dependencies = {
  dynamo: CommandClient;
  lambda: CommandClient;
  sessionTableName: string;
  workerFunctionArn: string;
  workerFunctionName: string;
  workerQualifier: string;
  now: () => Date;
};

type ReconciliationResult = {
  inspected: number;
  dispatched: number;
  terminalized: number;
  running: number;
};

export const PENDING_STALE_AFTER_MS = 2 * 60 * 1000;
const TERMINAL_EXECUTION_STATUSES = new Set([
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'STOPPED',
]);

const defaultDependencies: Dependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  lambda: new LambdaClient({}),
  sessionTableName: process.env.SESSION_TABLE_NAME ?? '',
  workerFunctionArn: process.env.ORIENTATION_GUIDE_FUNCTION_ARN ?? '',
  workerFunctionName: process.env.ORIENTATION_GUIDE_FUNCTION_NAME ?? '',
  workerQualifier: process.env.ORIENTATION_GUIDE_FUNCTION_QUALIFIER ?? '',
  now: () => new Date(),
};

async function invokeMissingExecution(deps: Dependencies, sessionId: string) {
  try {
    await deps.lambda.send(new InvokeCommand({
      FunctionName: deps.workerFunctionArn,
      InvocationType: 'Event',
      DurableExecutionName: sessionId,
      Payload: JSON.stringify({ sessionId }),
    }));
    return true;
  } catch (error) {
    // A concurrent starter or reconciliation pass won the race. The execution name
    // is the Session ID, so treating this as success cannot create duplicate work.
    if (isErrorNamed(error, 'DurableExecutionAlreadyStartedException')) return false;
    throw error;
  }
}

async function terminalizePendingSession(
  deps: Dependencies,
  sessionId: string,
  timestamp: string,
) {
  try {
    await deps.dynamo.send(new UpdateCommand({
      TableName: deps.sessionTableName,
      Key: { id: sessionId },
      ConditionExpression: '#s = :pending',
      UpdateExpression: 'SET #s = :failed, errorCode = :errorCode, completedAt = :timestamp, updatedAt = :timestamp',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':pending': 'PENDING',
        ':failed': 'FAILED',
        ':errorCode': 'GENERATION_FAILED',
        ':timestamp': timestamp,
      },
    }));
    return true;
  } catch (error) {
    // The worker or another pass already moved the Session forward.
    if (isErrorNamed(error, 'ConditionalCheckFailedException')) return false;
    throw error;
  }
}

async function findExactExecution(deps: Dependencies, sessionId: string) {
  const result = await deps.lambda.send(new ListDurableExecutionsByFunctionCommand({
    FunctionName: deps.workerFunctionName,
    Qualifier: deps.workerQualifier,
    DurableExecutionName: sessionId,
    MaxItems: 2,
  })) as { DurableExecutions?: Execution[] };

  return result.DurableExecutions?.find(
    (execution) => execution.DurableExecutionName === sessionId,
  );
}

export function createHandler(deps: Dependencies = defaultDependencies) {
  return async (): Promise<ReconciliationResult> => {
    if (
      !deps.sessionTableName
      || !deps.workerFunctionArn
      || !deps.workerFunctionName
      || !deps.workerQualifier
    ) {
      throw new Error('orientation-reconciler configuration is missing');
    }

    const reconciliationTime = deps.now();
    const timestamp = reconciliationTime.toISOString();
    const staleBefore = new Date(
      reconciliationTime.getTime() - PENDING_STALE_AFTER_MS,
    ).toISOString();
    const result: ReconciliationResult = {
      inspected: 0,
      dispatched: 0,
      terminalized: 0,
      running: 0,
    };
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const page = await deps.dynamo.send(new ScanCommand({
        TableName: deps.sessionTableName,
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
        FilterExpression: '#s = :pending AND updatedAt <= :staleBefore',
        ProjectionExpression: 'id',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':pending': 'PENDING',
          ':staleBefore': staleBefore,
        },
      })) as {
        Items?: PendingSession[];
        LastEvaluatedKey?: Record<string, unknown>;
      };

      for (const session of page.Items ?? []) {
        if (!session.id) continue;
        result.inspected += 1;
        const execution = await findExactExecution(deps, session.id);

        if (!execution) {
          if (await invokeMissingExecution(deps, session.id)) result.dispatched += 1;
          continue;
        }

        if (execution.Status === 'RUNNING') {
          result.running += 1;
          continue;
        }

        if (
          execution.Status
          && TERMINAL_EXECUTION_STATUSES.has(execution.Status)
          && await terminalizePendingSession(deps, session.id, timestamp)
        ) {
          result.terminalized += 1;
        }
      }

      exclusiveStartKey = page.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return result;
  };
}

export const handler = createHandler();
