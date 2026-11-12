import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import { loadObservationData, widenSearchTerm } from './data';

vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn() }));

const model = () => ({ list: vi.fn() });

describe('loadObservationData', () => {
  let models;
  beforeEach(() => {
    models = { Feed: model(), FeedItem: model(), CollectorRun: model(), FeedDailyCount: model() };
    generateClient.mockReset();
    generateClient.mockReturnValue({ models });
  });

  it('lists feeds, items and runs, following every page', async () => {
    models.Feed.list.mockResolvedValue({ data: [{ id: 'bbc' }] });
    models.FeedItem.list
      .mockResolvedValueOnce({ data: [{ id: 'a' }], nextToken: 'next' })
      .mockResolvedValueOnce({ data: [{ id: 'b' }] });
    models.CollectorRun.list.mockResolvedValue({ data: [{ startedAt: 'x' }] });
    models.FeedDailyCount.list.mockResolvedValue({ data: [{ feedId: 'bbc', day: '2026-10-31', count: 4 }] });

    const result = await loadObservationData();

    expect(result).toEqual({
      feeds: [{ id: 'bbc' }],
      items: [{ id: 'a' }, { id: 'b' }],
      runs: [{ startedAt: 'x' }],
      counts: [{ feedId: 'bbc', day: '2026-10-31', count: 4 }],
    });
    expect(models.FeedItem.list).toHaveBeenNthCalledWith(1, { limit: 1000, nextToken: undefined });
    expect(models.FeedItem.list).toHaveBeenNthCalledWith(2, { limit: 1000, nextToken: 'next' });
  });

  it('asks for only the run times', async () => {
    for (const m of Object.values(models)) m.list.mockResolvedValue({ data: [] });
    await loadObservationData();
    expect(models.CollectorRun.list).toHaveBeenCalledWith(
      expect.objectContaining({ selectionSet: ['startedAt', 'finishedAt'] }),
    );
  });

  it('asks for only the counts, with no text', async () => {
    for (const m of Object.values(models)) m.list.mockResolvedValue({ data: [] });
    await loadObservationData();
    expect(models.FeedDailyCount.list).toHaveBeenCalledWith(
      expect.objectContaining({ selectionSet: ['feedId', 'day', 'count'] }),
    );
  });

  it('fails with the first error message', async () => {
    models.Feed.list.mockResolvedValue({ data: [], errors: [{ message: 'Unauthorized' }] });
    models.FeedItem.list.mockResolvedValue({ data: [] });
    models.CollectorRun.list.mockResolvedValue({ data: [] });
    models.FeedDailyCount.list.mockResolvedValue({ data: [] });
    await expect(loadObservationData()).rejects.toThrow('Unauthorized');
  });
});

describe('widenSearchTerm', () => {
  const queryWith = (result) => {
    const widenSearch = vi.fn().mockResolvedValue(result);
    generateClient.mockReset();
    generateClient.mockReturnValue({ queries: { widenSearch } });
    return widenSearch;
  };

  it('returns the synonyms and broader terms', async () => {
    const widenSearch = queryWith({ data: { term: 'war', synonyms: ['warfare'], broader: ['action'] } });
    await expect(widenSearchTerm('war')).resolves.toEqual({ synonyms: ['warfare'], broader: ['action'] });
    expect(widenSearch).toHaveBeenCalledWith({ term: 'war' });
  });

  it('parses a JSON string result', async () => {
    queryWith({ data: JSON.stringify({ synonyms: ['a'], broader: [] }) });
    await expect(widenSearchTerm('x')).resolves.toEqual({ synonyms: ['a'], broader: [] });
  });

  it('treats a malformed result as nothing found', async () => {
    queryWith({ data: { synonyms: 'oops' } });
    await expect(widenSearchTerm('x')).resolves.toEqual({ synonyms: [], broader: [] });
    queryWith({ data: null });
    await expect(widenSearchTerm('x')).resolves.toEqual({ synonyms: [], broader: [] });
  });

  it('fails with the first error message', async () => {
    queryWith({ data: null, errors: [{ message: 'Unauthorized' }] });
    await expect(widenSearchTerm('x')).rejects.toThrow('Unauthorized');
  });
});
