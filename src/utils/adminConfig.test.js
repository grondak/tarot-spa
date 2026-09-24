import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import { updateAdminConfig } from './adminConfig';

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(),
}));

let update;

beforeEach(() => {
  update = vi.fn();
  generateClient.mockReset();
  generateClient.mockReturnValue({ models: { Config: { update } } });
});

describe('updateAdminConfig', () => {
  it('sends the singleton id with exactly the parsed pair', async () => {
    update.mockResolvedValue({ data: { id: 'global', dailyLimit: 10, monthlyBudget: 15.5 } });

    await updateAdminConfig({ dailyLimit: 10, monthlyBudget: 15.5 });

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      id: 'global',
      dailyLimit: 10,
      monthlyBudget: 15.5,
    });
  });

  it('returns only the canonical dailyLimit/monthlyBudget pair', async () => {
    update.mockResolvedValue({
      data: {
        id: 'global', dailyLimit: 10, monthlyBudget: 15.5, createdAt: 'x', updatedAt: 'y',
      },
    });

    await expect(updateAdminConfig({ dailyLimit: 10, monthlyBudget: 15.5 })).resolves.toEqual({
      dailyLimit: 10,
      monthlyBudget: 15.5,
    });
  });

  it('throws the first AppSync error message instead of swallowing it', async () => {
    update.mockResolvedValue({
      errors: [{ message: 'Not Authorized to access Config on type Mutation' }],
    });

    await expect(updateAdminConfig({ dailyLimit: 10, monthlyBudget: 15.5 })).rejects.toThrow(
      'Not Authorized to access Config on type Mutation',
    );
  });

  it('throws a stable error when the mutation returns no data', async () => {
    update.mockResolvedValue({ data: null });

    await expect(updateAdminConfig({ dailyLimit: 10, monthlyBudget: 15.5 })).rejects.toThrow(
      'Config was not returned',
    );
  });
});
