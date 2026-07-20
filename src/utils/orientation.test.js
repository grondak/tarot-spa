import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import {
  getOrientationStatus,
  getSession,
  startOrientationGuide,
} from './orientation';

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(),
}));

let client;

beforeEach(() => {
  client = {
    mutations: {
      startOrientationGuide: vi.fn(),
    },
    queries: {
      getOrientationStatus: vi.fn(),
    },
    models: {
      Session: {
        get: vi.fn(),
      },
    },
  };
  generateClient.mockReset();
  generateClient.mockReturnValue(client);
});

describe('startOrientationGuide', () => {
  it('calls the mutation with the request identity and parses string data', async () => {
    const payload = { sessionId: 'session-1', status: 'PENDING' };
    client.mutations.startOrientationGuide.mockResolvedValue({
      data: JSON.stringify(payload),
    });

    await expect(startOrientationGuide(
      'request-1',
      'A decision.',
      'decision',
    )).resolves.toEqual(payload);
    expect(client.mutations.startOrientationGuide).toHaveBeenCalledWith({
      requestId: 'request-1',
      context: 'A decision.',
      spreadKey: 'decision',
    });
  });

  it('throws the first mutation error message', async () => {
    client.mutations.startOrientationGuide.mockResolvedValue({
      errors: [{ message: 'wrapped IDEMPOTENCY_CONFLICT response' }],
    });

    await expect(startOrientationGuide(
      'request-1',
      'A decision.',
      'decision',
    )).rejects.toThrow('wrapped IDEMPOTENCY_CONFLICT response');
  });
});

describe('getSession', () => {
  it('gets only the exact Session and normalizes JSON fields plus legacy status', async () => {
    client.models.Session.get.mockResolvedValue({
      data: {
        id: 'session-1',
        cards: JSON.stringify([{ name: 'The Fool' }]),
        currentEvents: JSON.stringify([{ title: 'An event' }]),
      },
    });

    await expect(getSession('session-1')).resolves.toEqual({
      id: 'session-1',
      cards: [{ name: 'The Fool' }],
      currentEvents: [{ title: 'An event' }],
      status: 'SUCCEEDED',
    });
    expect(client.models.Session.get).toHaveBeenCalledWith({ id: 'session-1' });
  });

  it('returns null when the exact Session is absent and throws model errors', async () => {
    client.models.Session.get.mockResolvedValueOnce({ data: null });
    await expect(getSession('missing')).resolves.toBeNull();

    client.models.Session.get.mockResolvedValueOnce({
      errors: [{ message: 'read denied' }],
    });
    await expect(getSession('hidden')).rejects.toThrow('read denied');
  });
});

describe('getOrientationStatus', () => {
  it('retains the existing status query and string guard', async () => {
    client.queries.getOrientationStatus.mockResolvedValue({
      data: JSON.stringify({ limitExhausted: false }),
    });

    await expect(getOrientationStatus()).resolves.toEqual({ limitExhausted: false });
  });
});
