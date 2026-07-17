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
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Loading account');
    expect(await screen.findByText('Account record unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeVisible();

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
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeVisible();
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

  it('shows Log Out with a loaded account', async () => {
    getMyAccount.mockResolvedValue({ generation: 'SecondGen', onwardKeyGenerated: false });
    render(<AccountBar />);

    await waitFor(() => expect(screen.queryByText('Loading account…')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeVisible();
  });

  it('signs out once and notifies after sign-out resolves', async () => {
    const signOutFn = vi.fn().mockResolvedValue();
    const onSignedOut = vi.fn();
    getMyAccount.mockResolvedValue({ generation: 'SecondGen', onwardKeyGenerated: false });
    render(<AccountBar signOutFn={signOutFn} onSignedOut={onSignedOut} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Log Out' }));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
    expect(signOutFn).toHaveBeenCalledTimes(1);
    expect(signOutFn).toHaveBeenCalledWith();
    expect(signOutFn.mock.invocationCallOrder[0]).toBeLessThan(onSignedOut.mock.invocationCallOrder[0]);
  });

  it('notifies when sign-out rejects', async () => {
    const onSignedOut = vi.fn();
    getMyAccount.mockResolvedValue({ generation: 'SecondGen', onwardKeyGenerated: false });
    render(<AccountBar signOutFn={vi.fn().mockRejectedValue(new Error('failed'))} onSignedOut={onSignedOut} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Log Out' }));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });

  it('blocks a second sign-out while the first is pending', async () => {
    let resolveSignOut;
    const signOutFn = vi.fn(() => new Promise((resolve) => { resolveSignOut = resolve; }));
    const onSignedOut = vi.fn();
    getMyAccount.mockResolvedValue({ generation: 'SecondGen', onwardKeyGenerated: false });
    render(<AccountBar signOutFn={signOutFn} onSignedOut={onSignedOut} />);

    const logOut = await screen.findByRole('button', { name: 'Log Out' });
    fireEvent.click(logOut);
    fireEvent.click(logOut);

    expect(signOutFn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Logging out…' })).toBeDisabled();
    resolveSignOut();
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });

  it('shows Grant Invite Key beside Log Out for a first-generation account', async () => {
    getMyAccount.mockResolvedValue({ generation: 'FirstGen', onwardKeyGenerated: false });
    render(<AccountBar />);

    expect(await screen.findByRole('button', { name: 'Grant Invite Key' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeVisible();
  });
});
