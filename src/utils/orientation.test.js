import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import {
  generateOrientationGuide,
  getNewestSession,
} from './orientation';

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(),
}));

let client;

beforeEach(() => {
  client = {
    mutations: {
      generateOrientationGuide: vi.fn(),
    },
    models: {
      Session: {
        list: vi.fn(),
      },
    },
  };
  generateClient.mockReset();
  generateClient.mockReturnValue(client);
});

describe('generateOrientationGuide', () => {
  it('calls the mutation with Context and spread and parses string data', async () => {
    const payload = { sessionId: 'session-1', guide: 'A guide.' };
    client.mutations.generateOrientationGuide.mockResolvedValue({
      data: JSON.stringify(payload),
    });

    await expect(generateOrientationGuide('A decision.', 'decision')).resolves.toEqual(payload);
    expect(client.mutations.generateOrientationGuide).toHaveBeenCalledWith({
      context: 'A decision.',
      spreadKey: 'decision',
    });
  });

  it('throws the first mutation error message', async () => {
    client.mutations.generateOrientationGuide.mockResolvedValue({
      errors: [{ message: 'wrapped DAILY_LIMIT_EXHAUSTED response' }],
    });

    await expect(generateOrientationGuide('A decision.', 'decision')).rejects.toThrow(
      'wrapped DAILY_LIMIT_EXHAUSTED response',
    );
  });
});

describe('getNewestSession', () => {
  it('reads every page, including an empty page with a token, and normalizes the newest Session', async () => {
    client.models.Session.list
      .mockResolvedValueOnce({
        data: [],
        nextToken: 'page-2',
      })
      .mockResolvedValueOnce({
        data: [{
          id: 'older',
          createdAt: '2026-07-18T10:00:00.000Z',
          cards: [],
          currentEvents: [],
        }],
        nextToken: 'page-3',
      })
      .mockResolvedValueOnce({
        data: [{
          id: 'newest',
          createdAt: '2026-07-18T11:00:00.000Z',
          cards: JSON.stringify([{ name: 'The Fool' }]),
          currentEvents: JSON.stringify([{ title: 'An event' }]),
        }],
        nextToken: null,
      });

    await expect(getNewestSession()).resolves.toEqual({
      id: 'newest',
      createdAt: '2026-07-18T11:00:00.000Z',
      cards: [{ name: 'The Fool' }],
      currentEvents: [{ title: 'An event' }],
    });
    expect(client.models.Session.list).toHaveBeenNthCalledWith(1);
    expect(client.models.Session.list).toHaveBeenNthCalledWith(2, { nextToken: 'page-2' });
    expect(client.models.Session.list).toHaveBeenNthCalledWith(3, { nextToken: 'page-3' });
  });

  it('returns null when the caller has no Sessions', async () => {
    client.models.Session.list.mockResolvedValue({ data: [], nextToken: null });

    await expect(getNewestSession()).resolves.toBeNull();
  });
});
