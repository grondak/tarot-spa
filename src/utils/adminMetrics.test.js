import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import { getAdminMetrics } from './adminMetrics';

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(),
}));

const metrics = {
  generatedAt: '2026-07-26T18:04:00.000Z',
  usersByGeneration: { FirstGen: 3, SecondGen: 2 },
};

let adminMetrics;

beforeEach(() => {
  adminMetrics = vi.fn();
  generateClient.mockReset();
  generateClient.mockReturnValue({ queries: { adminMetrics } });
});

describe('getAdminMetrics', () => {
  it.each([
    ['JSON string', JSON.stringify(metrics)],
    ['object', metrics],
  ])('returns adminMetrics data supplied as a %s', async (_label, data) => {
    adminMetrics.mockResolvedValue({ data });

    await expect(getAdminMetrics()).resolves.toEqual(metrics);
    expect(adminMetrics).toHaveBeenCalledOnce();
  });

  it('throws the first AppSync error message', async () => {
    adminMetrics.mockResolvedValue({
      errors: [{ message: 'Not Authorized to access adminMetrics' }],
    });

    await expect(getAdminMetrics()).rejects.toThrow(
      'Not Authorized to access adminMetrics',
    );
  });
});
