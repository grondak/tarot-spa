import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

type Page = { Items?: Array<Record<string, unknown>>; LastEvaluatedKey?: Record<string, unknown> };

function commandInput(command: unknown) {
  return (command as { input: Record<string, unknown> }).input;
}

function dependencies(pages: Record<string, Page[]> = {}) {
  const queue = Object.fromEntries(
    Object.entries(pages).map(([table, tablePages]) => [table, [...tablePages]]),
  );
  const dynamo = {
    send: vi.fn(async (command: unknown) => {
      const input = commandInput(command);
      return queue[input.TableName as string]?.shift() ?? { Items: [] };
    }),
  };

  return {
    dynamo,
    inviteKeyTableName: 'InviteKeyTable',
    accountTableName: 'AccountTable',
    questionLogTableName: 'QuestionLogTable',
    now: () => new Date('2026-07-26T18:04:00.000Z'),
  };
}

describe('admin-logs handler', () => {
  it('returns empty, generatedAt-stamped logs for empty tables', async () => {
    const deps = dependencies();

    await expect(createHandler(deps)()).resolves.toEqual({
      generatedAt: '2026-07-26T18:04:00.000Z',
      mintingLog: [],
      adminActionLog: [],
      signupLog: [],
      questionsLog: [],
    });
  });

  it('fails clearly when table configuration is missing, without any scan', async () => {
    const deps = dependencies();
    deps.questionLogTableName = '';

    await expect(createHandler(deps)()).rejects.toThrow('admin-logs table configuration is missing');
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });

  it('builds the minting log from every key, newest first, with minter email resolved', async () => {
    const deps = dependencies({
      AccountTable: [{
        Items: [
          { id: 'admin-1', email: 'admin@example.com' },
          { id: 'user-1', email: 'erica@example.com' },
        ],
      }],
      InviteKeyTable: [{
        Items: [
          {
            id: 'OLDER-KEY', generation: 'FirstGen', status: 'unredeemed',
            createdAt: '2026-07-20T00:00:00.000Z', mintedBy: 'admin-1',
          },
          {
            id: 'NEWER-KEY', generation: 'SecondGen', status: 'redeemed',
            createdAt: '2026-07-25T00:00:00.000Z', mintedBy: 'user-1',
          },
        ],
      }],
    });

    const result = await createHandler(deps)();

    expect(result.mintingLog).toEqual([
      {
        code: 'NEWER-KEY', generation: 'SecondGen', status: 'redeemed',
        createdAt: '2026-07-25T00:00:00.000Z', mintedByEmail: 'erica@example.com',
      },
      {
        code: 'OLDER-KEY', generation: 'FirstGen', status: 'unredeemed',
        createdAt: '2026-07-20T00:00:00.000Z', mintedByEmail: 'admin@example.com',
      },
    ]);
  });

  it('falls back to the raw account id when no matching email is found', async () => {
    const deps = dependencies({
      InviteKeyTable: [{
        Items: [{
          id: 'ORPHAN-KEY', generation: 'SecondGen', status: 'unredeemed',
          createdAt: '2026-07-25T00:00:00.000Z', mintedBy: 'unknown-account',
        }],
      }],
    });

    const result = await createHandler(deps)();

    expect(result.mintingLog[0].mintedByEmail).toBe('unknown-account');
  });

  it('separates admin-minted and self-serve keys in the admin action log, and includes revokes', async () => {
    const deps = dependencies({
      AccountTable: [{
        Items: [
          { id: 'admin-1', email: 'admin@example.com' },
          { id: 'user-1', email: 'erica@example.com' },
        ],
      }],
      InviteKeyTable: [{
        Items: [
          // Admin-minted (FirstGen) — appears in the action log as "minted".
          {
            id: 'ADMIN-MINTED', generation: 'FirstGen', status: 'unredeemed',
            createdAt: '2026-07-20T00:00:00.000Z', mintedBy: 'admin-1',
          },
          // Self-serve onward mint (SecondGen) — not an admin action, excluded.
          {
            id: 'SELF-SERVE', generation: 'SecondGen', status: 'unredeemed',
            createdAt: '2026-07-21T00:00:00.000Z', mintedBy: 'user-1',
          },
          // Revoked key — appears as "revoked" regardless of generation.
          {
            id: 'REVOKED-KEY', generation: 'SecondGen', status: 'revoked',
            createdAt: '2026-07-19T00:00:00.000Z', mintedBy: 'user-1',
            revokedBy: 'admin-1', revokedAt: '2026-07-22T00:00:00.000Z',
          },
        ],
      }],
    });

    const result = await createHandler(deps)();

    expect(result.adminActionLog).toEqual([
      {
        code: 'REVOKED-KEY', action: 'revoked',
        byEmail: 'admin@example.com', at: '2026-07-22T00:00:00.000Z',
      },
      {
        code: 'ADMIN-MINTED', action: 'minted',
        byEmail: 'admin@example.com', at: '2026-07-20T00:00:00.000Z',
      },
    ]);
  });

  it('builds the signup log from every account, newest first', async () => {
    const deps = dependencies({
      AccountTable: [{
        Items: [
          {
            id: 'user-1', email: 'erica@example.com', redeemedInviteKey: 'OLD-KEY',
            generation: 'SecondGen', createdAt: '2026-07-20T00:00:00.000Z',
          },
          {
            id: 'user-2', email: 'tony@example.com', redeemedInviteKey: 'NEW-KEY',
            generation: 'FirstGen', createdAt: '2026-07-25T00:00:00.000Z',
          },
        ],
      }],
    });

    const result = await createHandler(deps)();

    expect(result.signupLog).toEqual([
      {
        email: 'tony@example.com', redeemedInviteKey: 'NEW-KEY',
        generation: 'FirstGen', createdAt: '2026-07-25T00:00:00.000Z',
      },
      {
        email: 'erica@example.com', redeemedInviteKey: 'OLD-KEY',
        generation: 'SecondGen', createdAt: '2026-07-20T00:00:00.000Z',
      },
    ]);
  });

  it('builds the questions log with owner resolved to email, never context or guide', async () => {
    const deps = dependencies({
      AccountTable: [{ Items: [{ id: 'user-1', email: 'erica@example.com' }] }],
      QuestionLogTable: [{
        Items: [{
          id: 'session-1',
          owner: 'user-1',
          occurredAt: '2026-07-25T00:00:00.000Z',
          durationMs: 5000,
          hadResult: true,
        }],
      }],
    });

    const result = await createHandler(deps)();

    expect(result.questionsLog).toEqual([{
      ownerEmail: 'erica@example.com',
      occurredAt: '2026-07-25T00:00:00.000Z',
      durationMs: 5000,
      hadResult: true,
    }]);
    expect(JSON.stringify(result)).not.toMatch(/context|guide/i);
  });

  it('caps each log to the most recent 100 entries', async () => {
    const items = Array.from({ length: 150 }, (_, index) => ({
      id: `session-${index}`,
      owner: 'user-1',
      occurredAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
      durationMs: 1000,
      hadResult: true,
    }));
    const deps = dependencies({
      QuestionLogTable: [{ Items: items }],
    });

    const result = await createHandler(deps)();

    expect(result.questionsLog).toHaveLength(100);
    expect(result.questionsLog[0].occurredAt).toBe(
      new Date(Date.UTC(2026, 0, 1 + 149)).toISOString(),
    );
  });

  it('paginates every scan', async () => {
    const deps = dependencies({
      AccountTable: [
        { Items: [{ id: 'user-1', email: 'erica@example.com' }], LastEvaluatedKey: { id: 'cursor' } },
        { Items: [{ id: 'user-2', email: 'tony@example.com' }] },
      ],
    });

    const result = await createHandler(deps)();

    expect(result.signupLog).toHaveLength(2);
  });
});
