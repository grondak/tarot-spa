import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountBar } from './App';
import { getMyAccount } from './utils/account';

vi.mock('./utils/account', () => ({ getMyAccount: vi.fn() }));

describe('AccountBar', () => {
  beforeEach(() => {
    getMyAccount.mockReset();
  });

  it('shows loading, then a retryable missing-account state', async () => {
    getMyAccount.mockResolvedValueOnce(null).mockResolvedValueOnce({
      generation: 'SecondGen',
      onwardKeyGenerated: false,
    });
    render(<AccountBar />);

    expect(screen.getByText('Loading account…')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Loading account');
    expect(await screen.findByText('Account record unavailable')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Retry account' }));

    expect(screen.getByText('Loading account…')).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText('Loading account…')).not.toBeInTheDocument();
      expect(screen.queryByText('Account record unavailable')).not.toBeInTheDocument();
      expect(getMyAccount).toHaveBeenCalledTimes(2);
    });
  });

  it('offers one retry after a query failure and disables overlap while loading', async () => {
    let resolveRetry;
    getMyAccount
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    render(<AccountBar />);

    const retry = await screen.findByRole('button', { name: 'Retry account' });
    expect(screen.getByRole('alert')).toHaveTextContent('Account couldn’t load');
    fireEvent.click(retry);
    fireEvent.click(retry);

    expect(screen.getByText('Loading account…')).toBeVisible();
    expect(getMyAccount).toHaveBeenCalledTimes(2);
    resolveRetry({ generation: 'SecondGen', onwardKeyGenerated: false });
    await waitFor(() => {
      expect(screen.queryByText('Loading account…')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
