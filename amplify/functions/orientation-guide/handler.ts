import { randomUUID } from 'node:crypto';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SPREADS, shuffleAndDraw } from '../../../src/utils/deck';
import {
  readConfig,
  reserveDaily,
  reserveMonthly,
  rollbackDaily,
  rollbackMonthly,
  type CommandClient,
  utcDate,
  utcMonth,
} from '../usage-counter/reservation';

type OrientationEvent = {
  identity?: { sub?: string } | null;
  arguments?: { context?: string; spreadKey?: string } | null;
};

type Card = {
  name: string;
  pattern: string;
  invertedPattern: string;
  questions: string[] | string;
  inverted: boolean;
};

type CurrentEvent = {
  title: string;
  content: string;
  url?: string;
  published_date?: string;
};

type HandlerDependencies = {
  dynamo: CommandClient;
  bedrock: CommandClient;
  fetchFn: typeof fetch;
  tableNames: {
    session: string;
    dailyUsage: string;
    monthlySpend: string;
    config: string;
  };
  tavilyApiKey: string;
  drawCards: (count: number) => Card[];
  now: () => Date;
};

export const COST_ESTIMATE_USD = 0.03;
const MODEL_ID = 'us.anthropic.claude-opus-4-6-v1';
const TAVILY_URL = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS = 20_000;

export const SYSTEM_PROMPT = "You generate Orientation Guides for Systems Thinking Tarot. An Orientation Guide serves the Orient step of the OODA loop: it is an orientation shift — a new way of seeing the situation — never advice, a recommendation, a summary, or a conversation. From the drawn card patterns and current events, form one systems-thinking Lens, then apply it to the user's Context in a single continuous essay of roughly 600–900 words. The essay must move through five things without headings or numbering: where the pattern actually shows up in their situation; what they are likely missing; a challenge to their framing if the underlying question is wrong; one non-obvious or counterintuitive implication; and better next questions they should be asking. Use each card's idea as an Oblique Strategy that shapes the discussion — never name the card or the word 'card' in the essay. Weave in the user's own specific details — their names, objects, phrases — and ground the Lens in the supplied current events where they genuinely connect. Be concrete and specific; avoid generic or widely-known advice; prefer reframing over summarizing. Output only the essay text.";

const defaultDependencies: HandlerDependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  bedrock: new BedrockRuntimeClient({}),
  fetchFn: globalThis.fetch,
  tableNames: {
    session: process.env.SESSION_TABLE_NAME ?? '',
    dailyUsage: process.env.DAILY_USAGE_TABLE_NAME ?? '',
    monthlySpend: process.env.MONTHLY_SPEND_TABLE_NAME ?? '',
    config: process.env.CONFIG_TABLE_NAME ?? '',
  },
  tavilyApiKey: process.env.TAVILY_API_KEY ?? '',
  drawCards: shuffleAndDraw,
  now: () => new Date(),
};

function activePattern(card: Card) {
  return card.inverted ? card.invertedPattern : card.pattern;
}

function buildUserMessage(
  cards: Array<Card & { position: string }>,
  currentEvents: CurrentEvent[],
  context: string,
) {
  const patterns = cards.map((card) => {
    const questions = Array.isArray(card.questions) ? card.questions.join('; ') : card.questions;
    return `${card.position}: ${activePattern(card)}\nQuestions: ${questions}`;
  }).join('\n\n');
  const events = currentEvents.length
    ? currentEvents.map((item) => `${item.title}\n${item.content}\nPublished: ${item.published_date ?? 'unknown'}`).join('\n\n')
    : 'No current events available — proceed without grounding.';

  return `DRAWN PATTERNS\n${patterns}\n\nCURRENT EVENTS\n${events}\n\nCONTEXT\n${context}`;
}

async function rollbackReservations(
  deps: HandlerDependencies,
  accountId: string,
  date: string,
  month: string,
  timestamp: string,
) {
  await rollbackMonthly(
    deps.dynamo,
    deps.tableNames.monthlySpend,
    month,
    COST_ESTIMATE_USD,
    timestamp,
  );
  await rollbackDaily(deps.dynamo, deps.tableNames.dailyUsage, accountId, date, timestamp);
}

async function searchCurrentEvents(
  deps: HandlerDependencies,
  cards: Array<Card & { position: string }>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const result = await deps.fetchFn(TAVILY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.tavilyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: cards.map(activePattern).join(' '),
        topic: 'news',
        search_depth: 'basic',
        max_results: 3,
      }),
      signal: controller.signal,
    });
    if (!result.ok) throw new Error(`Tavily returned ${result.status}`);
    const body = await result.json() as { results?: CurrentEvent[] };
    const currentEvents = (body.results ?? []).slice(0, 3).map((item) => ({
      title: item.title,
      content: item.content,
      url: item.url,
      published_date: item.published_date,
    }));
    return { currentEvents, tavilyTimedOut: false };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { currentEvents: [] as CurrentEvent[], tavilyTimedOut: true };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async (event: OrientationEvent) => {
    const accountId = event.identity?.sub;
    if (!accountId) throw new Error('authenticated identity required');

    const context = event.arguments?.context?.trim() ?? '';
    const spreadKey = event.arguments?.spreadKey ?? '';
    if (!context) throw new Error('context is required');
    if (!(spreadKey in SPREADS)) throw new Error('invalid spreadKey');
    if (Object.values(deps.tableNames).some((name) => !name) || !deps.tavilyApiKey) {
      throw new Error('orientation-guide configuration is missing');
    }

    const now = deps.now();
    const timestamp = now.toISOString();
    const date = utcDate(now);
    const month = utcMonth(now);
    const config = await readConfig(deps.dynamo, deps.tableNames.config);

    await reserveDaily(
      deps.dynamo,
      deps.tableNames.dailyUsage,
      accountId,
      date,
      config.dailyLimit,
      timestamp,
    );

    try {
      await reserveMonthly(
        deps.dynamo,
        deps.tableNames.monthlySpend,
        month,
        COST_ESTIMATE_USD,
        config.monthlyBudget,
        timestamp,
      );
    } catch (error) {
      await rollbackDaily(deps.dynamo, deps.tableNames.dailyUsage, accountId, date, timestamp);
      throw error;
    }

    const spread = SPREADS[spreadKey as keyof typeof SPREADS];
    const cards = deps.drawCards(spread.positions.length)
      .map((card, index) => ({ ...card, position: spread.positions[index] }));

    let grounding;
    try {
      grounding = await searchCurrentEvents(deps, cards);
    } catch {
      await rollbackReservations(deps, accountId, date, month, timestamp);
      throw new Error('GENERATION_FAILED');
    }

    let guide: string;
    try {
      const result = await deps.bedrock.send(new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{
          role: 'user',
          content: [{ text: buildUserMessage(cards, grounding.currentEvents, context) }],
        }],
        inferenceConfig: { maxTokens: 1500 },
      })) as { output?: { message?: { content?: Array<{ text?: string }> } } };
      guide = result.output?.message?.content?.[0]?.text ?? '';
      if (!guide) throw new Error('Bedrock returned no essay');
    } catch {
      await rollbackReservations(deps, accountId, date, month, timestamp);
      throw new Error('GENERATION_FAILED');
    }

    const sessionId = randomUUID();
    const payloadCards = cards.map(({ name, position, inverted }) => ({ name, position, inverted }));
    try {
      await deps.dynamo.send(new PutCommand({
        TableName: deps.tableNames.session,
        Item: {
          id: sessionId,
          owner: accountId,
          spreadKey,
          context,
          cards: payloadCards,
          currentEvents: grounding.currentEvents,
          guide,
          tavilyTimedOut: grounding.tavilyTimedOut,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }));
    } catch (error) {
      console.error('Orientation Guide generated but Session persistence failed', error);
    }

    return {
      sessionId,
      cards: payloadCards,
      currentEvents: grounding.currentEvents,
      guide,
      tavilyTimedOut: grounding.tavilyTimedOut,
    };
  };
}

export const handler = createHandler();
