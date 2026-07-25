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
        context: 'A decision.',
        spreadKey: 'single',
        cards: JSON.stringify([{ name: 'The Fool', position: 'Draw', inverted: false }]),
        currentEvents: JSON.stringify([{ title: 'An event', content: 'Useful detail.' }]),
        guide: 'A complete guide.',
        tavilyTimedOut: false,
      },
    });

    await expect(getSession('session-1')).resolves.toEqual({
      id: 'session-1',
      context: 'A decision.',
      spreadKey: 'single',
      cards: [{ name: 'The Fool', position: 'Draw', inverted: false }],
      currentEvents: [{ title: 'An event', content: 'Useful detail.' }],
      guide: 'A complete guide.',
      tavilyTimedOut: false,
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

  it.each([
    {
      label: 'invalid JSON',
      data: {
        id: 'session-1',
        context: 'A decision.',
        spreadKey: 'single',
        cards: '{not-json',
        currentEvents: '[]',
        guide: 'A guide.',
        tavilyTimedOut: false,
        status: 'SUCCEEDED',
      },
    },
    {
      label: 'invalid result shape',
      data: {
        id: 'session-1',
        context: 'A decision.',
        spreadKey: 'single',
        cards: null,
        currentEvents: [],
        guide: 'A guide.',
        tavilyTimedOut: false,
        status: 'SUCCEEDED',
      },
    },
    {
      label: 'wrong card count',
      data: {
        id: 'session-1',
        context: 'A decision.',
        spreadKey: 'single',
        cards: [],
        currentEvents: [],
        guide: 'A guide.',
        tavilyTimedOut: false,
        status: 'SUCCEEDED',
      },
    },
    {
      label: 'malformed event element',
      data: {
        id: 'session-1',
        context: 'A decision.',
        spreadKey: 'single',
        cards: [{ name: 'The Fool', position: 'Draw', inverted: false }],
        currentEvents: [{ title: 'Missing content' }],
        guide: 'A guide.',
        tavilyTimedOut: false,
        status: 'SUCCEEDED',
      },
    },
  ])('rejects a SUCCEEDED Session with $label', async ({ data }) => {
    client.models.Session.get.mockResolvedValue({ data });

    const failure = getSession('session-1');
    await expect(failure).rejects.toThrow('MALFORMED_SESSION');
    await expect(failure).rejects.toMatchObject({
      session: {
        id: 'session-1',
        context: 'A decision.',
        spreadKey: 'single',
      },
    });
  });

  it.each(['PENDING', 'RUNNING', 'FAILED'])('rejects a mismatched id for %s', async (status) => {
    client.models.Session.get.mockResolvedValue({
      data: {
        id: 'different-session',
        context: 'Safe recovery context.',
        spreadKey: 'decision',
        status,
      },
    });

    await expect(getSession('session-1')).rejects.toMatchObject({
      message: 'MALFORMED_SESSION',
      session: {
        id: 'different-session',
        context: 'Safe recovery context.',
        spreadKey: 'decision',
      },
    });
  });

  it('rejects an unknown lifecycle status', async () => {
    client.models.Session.get.mockResolvedValue({
      data: { id: 'session-1', status: 'REPLAYING' },
    });

    await expect(getSession('session-1')).rejects.toThrow('MALFORMED_SESSION');
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
