import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import { getAdminLogs } from './adminLogs';

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(),
}));

const logs = {
  generatedAt: '2026-07-26T18:04:00.000Z',
  mintingLog: [],
  adminActionLog: [],
  signupLog: [],
  questionsLog: [],
};

let adminLogs;

beforeEach(() => {
  adminLogs = vi.fn();
  generateClient.mockReset();
  generateClient.mockReturnValue({ queries: { adminLogs } });
});

describe('getAdminLogs', () => {
  it.each([
    ['JSON string', JSON.stringify(logs)],
    ['object', logs],
  ])('returns adminLogs data supplied as a %s', async (_label, data) => {
    adminLogs.mockResolvedValue({ data });

    await expect(getAdminLogs()).resolves.toEqual(logs);
    expect(adminLogs).toHaveBeenCalledOnce();
  });

  it('throws the first AppSync error message', async () => {
    adminLogs.mockResolvedValue({
      errors: [{ message: 'Not Authorized to access adminLogs' }],
    });

    await expect(getAdminLogs()).rejects.toThrow(
      'Not Authorized to access adminLogs',
    );
  });
});
