import { generateClient } from 'aws-amplify/data';

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

  return {
    ...data,
    status: data.status ?? 'SUCCEEDED',
    cards: typeof data.cards === 'string' ? JSON.parse(data.cards) : data.cards,
    currentEvents: typeof data.currentEvents === 'string'
      ? JSON.parse(data.currentEvents)
      : data.currentEvents,
  };
}
