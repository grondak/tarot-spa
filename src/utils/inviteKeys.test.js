import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import { adminMintInviteKey } from './inviteKeys';

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(),
}));

let mintMutation;

beforeEach(() => {
  mintMutation = vi.fn();
  generateClient.mockReset();
  generateClient.mockReturnValue({
    mutations: { adminMintInviteKey: mintMutation },
  });
});

describe('adminMintInviteKey', () => {
  it('returns the minted code', async () => {
    mintMutation.mockResolvedValue({ data: 'ABCD-EFGH-JKMP' });

    await expect(adminMintInviteKey()).resolves.toBe('ABCD-EFGH-JKMP');
    expect(generateClient).toHaveBeenCalledWith();
    expect(mintMutation).toHaveBeenCalledOnce();
  });

  it('throws the first AppSync error message', async () => {
    mintMutation.mockResolvedValue({
      errors: [{ message: 'Not Authorized to access adminMintInviteKey' }],
    });

    await expect(adminMintInviteKey()).rejects.toThrow(
      'Not Authorized to access adminMintInviteKey',
    );
  });

  it('throws when AppSync does not return a code', async () => {
    mintMutation.mockResolvedValue({ data: null });

    await expect(adminMintInviteKey()).rejects.toThrow(
      'Invite Key was not returned',
    );
  });
});
