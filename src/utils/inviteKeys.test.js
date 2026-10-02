import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import { adminMintInviteKey, revokeInviteKey } from './inviteKeys';

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(),
}));

let mintMutation;
let revokeMutation;

beforeEach(() => {
  mintMutation = vi.fn();
  revokeMutation = vi.fn();
  generateClient.mockReset();
  generateClient.mockReturnValue({
    mutations: { adminMintInviteKey: mintMutation, revokeInviteKey: revokeMutation },
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

describe('revokeInviteKey', () => {
  it('calls the mutation with the code and returns true on success', async () => {
    revokeMutation.mockResolvedValue({ data: true });

    await expect(revokeInviteKey('ABCD-EFGH-JKMP')).resolves.toBe(true);
    expect(generateClient).toHaveBeenCalledWith();
    expect(revokeMutation).toHaveBeenCalledWith({ code: 'ABCD-EFGH-JKMP' });
  });

  it('throws the stable backend error code unchanged when AppSync returns an errors array', async () => {
    revokeMutation.mockResolvedValue({
      errors: [{ message: 'INVITE_KEY_ALREADY_REDEEMED' }],
    });

    await expect(revokeInviteKey('ABCD-EFGH-JKMP')).rejects.toThrow(
      'INVITE_KEY_ALREADY_REDEEMED',
    );
  });

  it('throws a clear error when AppSync returns no data and no errors', async () => {
    revokeMutation.mockResolvedValue({ data: null });

    await expect(revokeInviteKey('ABCD-EFGH-JKMP')).rejects.toThrow(
      'Invite Key was not revoked',
    );
  });
});
