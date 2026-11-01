import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClient } from 'aws-amplify/data';
import { suggestSource } from './suggest';

vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn() }));

describe('suggestSource', () => {
  const mutate = vi.fn();
  beforeEach(() => {
    mutate.mockReset();
    generateClient.mockReset();
    generateClient.mockReturnValue({ mutations: { suggestSource: mutate } });
  });

  it('sends the suggestion and an optional contact', async () => {
    mutate.mockResolvedValue({ data: true });
    await expect(suggestSource('Sailing news', 'me@example.com')).resolves.toBe(true);
    expect(mutate).toHaveBeenCalledWith({ suggestion: 'Sailing news', contact: 'me@example.com' });
  });

  it('leaves the contact out when blank', async () => {
    mutate.mockResolvedValue({ data: true });
    await suggestSource('Sailing news', '');
    expect(mutate).toHaveBeenCalledWith({ suggestion: 'Sailing news', contact: undefined });
  });

  it('fails with the first error message, or when nothing was sent', async () => {
    mutate.mockResolvedValueOnce({ data: null, errors: [{ message: 'Unauthorized' }] });
    await expect(suggestSource('x')).rejects.toThrow('Unauthorized');
    mutate.mockResolvedValueOnce({ data: false });
    await expect(suggestSource('x')).rejects.toThrow('Suggestion was not sent');
  });
});
