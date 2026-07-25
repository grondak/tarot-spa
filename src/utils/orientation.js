import { generateClient } from 'aws-amplify/data';
import { SPREADS } from './deck';

function parseJsonValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('MALFORMED_SESSION');
  }
}

function isCurrentEvent(event) {
  return event !== null
    && typeof event === 'object'
    && typeof event.title === 'string'
    && event.title.trim().length > 0
    && typeof event.content === 'string'
    && event.content.trim().length > 0
    && (event.url === undefined || typeof event.url === 'string')
    && (event.published_date === undefined || typeof event.published_date === 'string');
}

export function isCompleteGuideSession(session, sessionId = session?.id) {
  const positions = typeof session?.spreadKey === 'string'
    && Object.hasOwn(SPREADS, session.spreadKey)
    ? SPREADS[session.spreadKey].positions
    : null;

  return session.id === sessionId
    && typeof session.context === 'string'
    && typeof session.guide === 'string'
    && session.guide.trim().length > 0
    && positions !== null
    && Array.isArray(session.cards)
    && session.cards.length === positions.length
    && session.cards.every((card, index) => (
      card !== null
      && typeof card === 'object'
      && typeof card.name === 'string'
      && card.name.trim().length > 0
      && card.position === positions[index]
      && typeof card.inverted === 'boolean'
    ))
    && Array.isArray(session.currentEvents)
    && session.currentEvents.every(isCurrentEvent)
    && typeof session.tavilyTimedOut === 'boolean';
}

function malformedSession(session) {
  const error = new Error('MALFORMED_SESSION');
  error.session = {
    id: typeof session?.id === 'string' ? session.id : undefined,
    context: typeof session?.context === 'string' ? session.context : undefined,
    spreadKey: typeof session?.spreadKey === 'string' ? session.spreadKey : undefined,
  };
  return error;
}

export async function getOrientationStatus() {
  const client = generateClient();
  const { data, errors } = await client.queries.getOrientationStatus();
  if (errors?.length) throw new Error(errors[0].message);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

export async function startOrientationGuide(requestId, context, spreadKey) {
  const client = generateClient();
  const { data, errors } = await client.mutations.startOrientationGuide({
    requestId,
    context,
    spreadKey,
  });
  if (errors?.length) throw new Error(errors[0].message);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

export async function getSession(sessionId) {
  const client = generateClient();
  const { data, errors } = await client.models.Session.get({ id: sessionId });
  if (errors?.length) throw new Error(errors[0].message);
  if (!data) return null;

  let cards;
  let currentEvents;
  try {
    cards = parseJsonValue(data.cards);
    currentEvents = parseJsonValue(data.currentEvents);
  } catch {
    throw malformedSession(data);
  }
  const session = {
    ...data,
    status: data.status ?? 'SUCCEEDED',
    cards,
    currentEvents,
  };
  if (
    session.id !== sessionId
    || !['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'].includes(session.status)
    || (session.status === 'SUCCEEDED' && !isCompleteGuideSession(session, sessionId))
  ) {
    throw malformedSession(session);
  }
  return session;
}
