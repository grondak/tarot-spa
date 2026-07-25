import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { SPREADS } from '../../../src/utils/deck';
import { effectiveStatus, isErrorNamed } from '../usage-counter/reservation';

type StartOrientationGuideEvent = {
  identity?: { sub?: string } | null;
  arguments?: {
    requestId?: string;
    context?: string;
    spreadKey?: string;
  } | null;
};

type CommandClient = {
  send(command: unknown): Promise<unknown>;
};

type HandlerDependencies = {
  dynamo: CommandClient;
  lambda: CommandClient;
  tableNames: {
    session: string;
  };
  workerFunctionArn: string;
  now: () => Date;
};

type ExistingSession = {
  owner?: string;
  context?: string;
  spreadKey?: string;
  status?: string;
};

const MAX_CONTEXT_CHARACTERS = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const defaultDependencies: HandlerDependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  lambda: new LambdaClient({}),
  tableNames: {
    session: process.env.SESSION_TABLE_NAME ?? '',
  },
  workerFunctionArn: process.env.ORIENTATION_GUIDE_FUNCTION_ARN ?? '',
  now: () => new Date(),
};

async function invokeWorker(
  deps: HandlerDependencies,
  requestId: string,
) {
  try {
    await deps.lambda.send(new InvokeCommand({
      FunctionName: deps.workerFunctionArn,
      InvocationType: 'Event',
      DurableExecutionName: requestId,
      Payload: JSON.stringify({ sessionId: requestId }),
    }));
  } catch (error) {
    if (isErrorNamed(error, 'DurableExecutionAlreadyStartedException')) return;
    throw error;
  }
}

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async (event: StartOrientationGuideEvent) => {
    const accountId = event.identity?.sub;
    if (!accountId) throw new Error('authenticated identity required');

    const requestId = event.arguments?.requestId ?? '';
    const context = event.arguments?.context ?? '';
    const spreadKey = event.arguments?.spreadKey ?? '';
    if (!context.trim()) throw new Error('context is required');
    if (context.length > MAX_CONTEXT_CHARACTERS) {
      throw new Error(`context must be ${MAX_CONTEXT_CHARACTERS} characters or fewer`);
    }
    if (!Object.hasOwn(SPREADS, spreadKey)) throw new Error('invalid spreadKey');
    if (!UUID_PATTERN.test(requestId)) throw new Error('invalid requestId');
    if (!deps.tableNames.session || !deps.workerFunctionArn) {
      throw new Error('start-orientation-guide configuration is missing');
    }

    const timestamp = deps.now().toISOString();
    let existing: ExistingSession | undefined;

    try {
      await deps.dynamo.send(new PutCommand({
        TableName: deps.tableNames.session,
        Item: {
          id: requestId,
          owner: accountId,
          spreadKey,
          context,
          status: 'PENDING',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      }));
    } catch (error) {
      if (!isErrorNamed(error, 'ConditionalCheckFailedException')) throw error;

      const result = await deps.dynamo.send(new GetCommand({
        TableName: deps.tableNames.session,
        Key: { id: requestId },
        ConsistentRead: true,
      })) as { Item?: ExistingSession };
      existing = result.Item;

      if (
        existing?.owner !== accountId
        || existing.context !== context
        || existing.spreadKey !== spreadKey
      ) {
        throw new Error('IDEMPOTENCY_CONFLICT');
      }
    }

    const status = existing ? effectiveStatus(existing) : 'PENDING';
    if (!existing || status === 'PENDING') {
      await invokeWorker(deps, requestId);
    }

    return {
      sessionId: requestId,
      status,
    };
  };
}

export const handler = createHandler();
