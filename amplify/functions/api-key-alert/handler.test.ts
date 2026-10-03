import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHandler, parseWarningWindowDays } from './handler';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const DAY_SECONDS = 24 * 60 * 60;

function dependencies() {
  return {
    appsync: { send: vi.fn() },
    ses: { send: vi.fn().mockResolvedValue({}) },
    apiId: 'abc123apiid',
    fromEmail: 'sender@example.com',
    cutoutEmail: 'operator@example.com',
    warningWindowDays: 7,
  };
}

function listApiKeysResult(expiresInSecondsFromNow: number[]) {
  return { apiKeys: expiresInSecondsFromNow.map((offset) => ({ expires: NOW_SECONDS + offset })) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('api-key-alert handler', () => {
  it('sends no email when the soonest key expires more than 7 days out', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce(listApiKeysResult([8 * DAY_SECONDS]));

    await createHandler(deps)();

    expect(deps.appsync.send).toHaveBeenCalledOnce();
    expect(deps.appsync.send.mock.calls[0][0].input).toEqual({ apiId: 'abc123apiid' });
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('does not send when expiry is just over the 7-day boundary (7 days + 1 hour)', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce(listApiKeysResult([7 * DAY_SECONDS + 3600]));

    await createHandler(deps)();

    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('sends exactly one reminder email naming the days remaining and the redeploy fix at exactly 7 days', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce(listApiKeysResult([7 * DAY_SECONDS]));

    await createHandler(deps)();

    expect(deps.ses.send).toHaveBeenCalledOnce();
    const input = deps.ses.send.mock.calls[0][0].input;
    expect(input).toEqual({
      FromEmailAddress: 'sender@example.com',
      Destination: { ToAddresses: ['operator@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'tarot-spa API key alert: expiring soon' },
          Body: {
            Text: {
              Data: expect.stringContaining('expires in 7 day(s)'),
            },
          },
        },
      },
    });
    expect(input.Content.Simple.Body.Text.Data).toContain('npx ampx sandbox --once');
  });

  it('sends a reminder naming the smaller day count when within the window (e.g. 3 days)', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce(listApiKeysResult([3 * DAY_SECONDS]));

    await createHandler(deps)();

    expect(deps.ses.send).toHaveBeenCalledOnce();
    expect(deps.ses.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data).toContain('expires in 3 day(s)');
  });

  it('sends one urgent "no active API key found" email when ListApiKeys returns an empty list', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce({ apiKeys: [] });

    await createHandler(deps)();

    expect(deps.ses.send).toHaveBeenCalledOnce();
    const input = deps.ses.send.mock.calls[0][0].input;
    expect(input.Content.Simple.Subject.Data).toBe('tarot-spa API key alert: no active API key found');
    expect(input.Content.Simple.Body.Text.Data).toContain('No active AppSync API key with valid expiry metadata');
    expect(input.Content.Simple.Body.Text.Data).toContain('npx ampx sandbox --once');
  });

  it('treats a missing apiKeys field the same as an empty list', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce({});

    await createHandler(deps)();

    expect(deps.ses.send).toHaveBeenCalledOnce();
    expect(deps.ses.send.mock.calls[0][0].input.Content.Simple.Subject.Data)
      .toBe('tarot-spa API key alert: no active API key found');
  });

  it('treats a key with a non-numeric/missing expires field as having no valid expiry data', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce({ apiKeys: [{}, { expires: undefined }] });

    await createHandler(deps)();

    expect(deps.ses.send).toHaveBeenCalledOnce();
    expect(deps.ses.send.mock.calls[0][0].input.Content.Simple.Subject.Data)
      .toBe('tarot-spa API key alert: no active API key found');
  });

  it('ignores a key with no valid expiry data and alerts on a different key that does have one', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce({
      apiKeys: [{}, { expires: NOW_SECONDS + 3 * DAY_SECONDS }],
    });

    await createHandler(deps)();

    expect(deps.ses.send).toHaveBeenCalledOnce();
    const input = deps.ses.send.mock.calls[0][0].input;
    expect(input.Content.Simple.Subject.Data).toBe('tarot-spa API key alert: expiring soon');
    expect(input.Content.Simple.Body.Text.Data).toContain('expires in 3 day(s)');
  });

  it('sends a distinct ALREADY EXPIRED alert (not a negative day count) when the soonest key has already expired', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce(listApiKeysResult([-3 * DAY_SECONDS]));

    await createHandler(deps)();

    expect(deps.ses.send).toHaveBeenCalledOnce();
    const input = deps.ses.send.mock.calls[0][0].input;
    expect(input.Content.Simple.Subject.Data).toBe('tarot-spa API key alert: ALREADY EXPIRED');
    expect(input.Content.Simple.Body.Text.Data).toContain('expired 3 day(s) ago');
    expect(input.Content.Simple.Body.Text.Data).not.toMatch(/expires in -\d/);
    expect(input.Content.Simple.Body.Text.Data).toContain('npx ampx sandbox --once');
  });

  it('treats the exact expiry instant (daysRemaining === 0) as the expiring-soon path, not already-expired', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce(listApiKeysResult([0]));

    await createHandler(deps)();

    expect(deps.ses.send).toHaveBeenCalledOnce();
    expect(deps.ses.send.mock.calls[0][0].input.Content.Simple.Subject.Data)
      .toBe('tarot-spa API key alert: expiring soon');
  });

  it('picks the soonest-expiring key out of multiple, regardless of list order', async () => {
    const depsAscending = dependencies();
    depsAscending.appsync.send.mockResolvedValueOnce(listApiKeysResult([3 * DAY_SECONDS, 30 * DAY_SECONDS]));
    await createHandler(depsAscending)();
    expect(depsAscending.ses.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data).toContain('3 day(s)');

    const depsDescending = dependencies();
    depsDescending.appsync.send.mockResolvedValueOnce(listApiKeysResult([30 * DAY_SECONDS, 3 * DAY_SECONDS]));
    await createHandler(depsDescending)();
    expect(depsDescending.ses.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data).toContain('3 day(s)');
  });

  it('does not send when every key among multiple is healthy', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce(listApiKeysResult([30 * DAY_SECONDS, 45 * DAY_SECONDS]));

    await createHandler(deps)();

    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('throws a config-missing error before any AWS call when APPSYNC_API_ID is unset', async () => {
    const deps = dependencies();
    deps.apiId = '';

    await expect(createHandler(deps)()).rejects.toThrow('api-key-alert configuration is missing');
    expect(deps.appsync.send).not.toHaveBeenCalled();
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('throws a config-missing error before any AWS call when ACCESS_FROM_EMAIL is unset', async () => {
    const deps = dependencies();
    deps.fromEmail = '';

    await expect(createHandler(deps)()).rejects.toThrow('api-key-alert configuration is missing');
    expect(deps.appsync.send).not.toHaveBeenCalled();
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('throws a config-missing error before any AWS call when CUTOUT_EMAIL is unset', async () => {
    const deps = dependencies();
    deps.cutoutEmail = '';

    await expect(createHandler(deps)()).rejects.toThrow('api-key-alert configuration is missing');
    expect(deps.appsync.send).not.toHaveBeenCalled();
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('propagates an AppSync ListApiKeys failure unchanged, without any SES call', async () => {
    const deps = dependencies();
    const failure = new Error('AppSync throttled');
    deps.appsync.send.mockRejectedValueOnce(failure);

    await expect(createHandler(deps)()).rejects.toBe(failure);
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('propagates an SES send failure unchanged', async () => {
    const deps = dependencies();
    deps.appsync.send.mockResolvedValueOnce(listApiKeysResult([3 * DAY_SECONDS]));
    const failure = new Error('SES unavailable');
    deps.ses.send.mockRejectedValueOnce(failure);

    await expect(createHandler(deps)()).rejects.toBe(failure);
  });
});

describe('parseWarningWindowDays', () => {
  it('honors an explicit 0 instead of silently falling back to the default', () => {
    expect(parseWarningWindowDays('0')).toBe(0);
  });

  it('honors a positive override', () => {
    expect(parseWarningWindowDays('14')).toBe(14);
  });

  it('falls back to the default for undefined', () => {
    expect(parseWarningWindowDays(undefined)).toBe(7);
  });

  it('falls back to the default for a non-numeric string', () => {
    expect(parseWarningWindowDays('not-a-number')).toBe(7);
  });

  it('falls back to the default for a negative number', () => {
    expect(parseWarningWindowDays('-3')).toBe(7);
  });
});
