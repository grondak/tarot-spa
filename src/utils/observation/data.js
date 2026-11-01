import { generateClient } from 'aws-amplify/data';

const PAGE_SIZE = 1000;

// The shared feed tables are small (about a month of news), so the page lists everything and
// does its own filtering by time, source and search.
async function listAll(modelName, options = {}) {
  const client = generateClient();
  const rows = [];
  let nextToken;
  do {
    const { data, errors, nextToken: next } = await client.models[modelName].list({
      ...options,
      limit: PAGE_SIZE,
      nextToken,
    });
    if (errors?.length) throw new Error(errors[0].message);
    rows.push(...data);
    nextToken = next;
  } while (nextToken);
  return rows;
}

export async function loadObservationData() {
  const [feeds, items, runs] = await Promise.all([
    listAll('Feed'),
    listAll('FeedItem'),
    // Only the times: the per-feed results can be large, and gaps need just start and finish.
    listAll('CollectorRun', { selectionSet: ['startedAt', 'finishedAt'] }),
  ]);
  return { feeds, items, runs };
}

// WordNet synonyms and broader terms for one word, from the widen-search Lambda.
export async function widenSearchTerm(term) {
  const client = generateClient();
  const { data, errors } = await client.queries.widenSearch({ term });
  if (errors?.length) throw new Error(errors[0].message);
  const result = typeof data === 'string' ? JSON.parse(data) : data;
  return {
    synonyms: Array.isArray(result?.synonyms) ? result.synonyms : [],
    broader: Array.isArray(result?.broader) ? result.broader : [],
  };
}
