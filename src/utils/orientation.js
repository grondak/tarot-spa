import { generateClient } from 'aws-amplify/data';

export async function getOrientationStatus() {
  const client = generateClient();
  const { data, errors } = await client.queries.getOrientationStatus();
  if (errors?.length) throw new Error(errors[0].message);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

export async function generateOrientationGuide(context, spreadKey) {
  const client = generateClient();
  const { data, errors } = await client.mutations.generateOrientationGuide({ context, spreadKey });
  if (errors?.length) throw new Error(errors[0].message);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

export async function getNewestSession() {
  const client = generateClient();
  const sessions = [];
  let nextToken;

  do {
    const page = nextToken
      ? await client.models.Session.list({ nextToken })
      : await client.models.Session.list();
    const { data, nextToken: followingToken } = page;
    sessions.push(...data);
    nextToken = followingToken;
  } while (nextToken);

  const newest = sessions.reduce(
    (latest, session) => !latest || session.createdAt > latest.createdAt ? session : latest,
    null,
  );
  if (!newest) return null;

  return {
    ...newest,
    cards: typeof newest.cards === 'string' ? JSON.parse(newest.cards) : newest.cards,
    currentEvents: typeof newest.currentEvents === 'string'
      ? JSON.parse(newest.currentEvents)
      : newest.currentEvents,
  };
}
