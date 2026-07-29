import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAuthSession } from 'aws-amplify/auth';
import { isAdmin } from './adminAuth';

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
}));

beforeEach(() => {
  fetchAuthSession.mockReset();
});

describe('isAdmin', () => {
  it('returns true only when the ID token groups include Admin', async () => {
    fetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: { 'cognito:groups': ['Member', 'Admin'] },
        },
      },
    });

    await expect(isAdmin()).resolves.toBe(true);
  });

  it.each([
    ['different groups', { tokens: { idToken: { payload: { 'cognito:groups': ['Member'] } } } }],
    ['non-array groups', { tokens: { idToken: { payload: { 'cognito:groups': 'Admin' } } } }],
    ['missing tokens', {}],
  ])('fails closed for %s', async (_label, session) => {
    fetchAuthSession.mockResolvedValue(session);
    await expect(isAdmin()).resolves.toBe(false);
  });

  it('fails closed when fetching the session throws', async () => {
    fetchAuthSession.mockRejectedValue(new Error('session unavailable'));
    await expect(isAdmin()).resolves.toBe(false);
  });
});
