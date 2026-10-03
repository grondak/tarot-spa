import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AccountScreen from './AccountScreen';

describe('AccountScreen', () => {
  it('renders an announced loading state and keeps Back navigation available', () => {
    const onBack = vi.fn();
    render(
      <AccountScreen getMyAccountFn={() => new Promise(() => {})} onBack={onBack} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading account');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders a retryable error and re-fetches successfully', async () => {
    const getMyAccountFn = vi.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ generation: 'SecondGen', onwardKeyGenerated: false });
    render(<AccountScreen getMyAccountFn={getMyAccountFn} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Account couldn’t load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(getMyAccountFn).toHaveBeenCalledTimes(2);
  });

  it('renders a retryable missing-account state', async () => {
    const getMyAccountFn = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ generation: 'FirstGen', onwardKeyGenerated: true });
    render(<AccountScreen getMyAccountFn={getMyAccountFn} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Account record unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('First generation')).toBeVisible();
  });

  it('tells a First-Gen account it can mint an invite key', async () => {
    render(
      <AccountScreen
        getMyAccountFn={() => Promise.resolve({ generation: 'FirstGen', onwardKeyGenerated: true })}
      />,
    );

    expect(await screen.findByText('First generation')).toBeVisible();
    expect(screen.getByText('Your account can mint a key to invite others.')).toBeVisible();
  });

  it('tells a Second-Gen account it may not mint invite keys', async () => {
    render(
      <AccountScreen
        getMyAccountFn={() => Promise.resolve({ generation: 'SecondGen', onwardKeyGenerated: false })}
      />,
    );

    expect(await screen.findByText('Second generation')).toBeVisible();
    expect(screen.getByText(
      'At this time, second generation accounts may not mint keys to invite others. We’re testing who’s sharing the app. Thanks for your understanding.',
    )).toBeVisible();
  });
});
