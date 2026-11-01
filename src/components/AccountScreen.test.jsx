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

  describe('Observation Window data', () => {
    const account = () => Promise.resolve({ generation: 'FirstGen', onwardKeyGenerated: true });

    it('says there is no server-side history and clears what this browser remembers', async () => {
      const clearPreferencesFn = vi.fn().mockReturnValue(true);
      render(<AccountScreen getMyAccountFn={account} clearPreferencesFn={clearPreferencesFn} />);

      expect(await screen.findByText(/Nothing about what you look at in the Observation Window is stored on our servers/)).toBeVisible();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Clear what this browser remembers' }));

      expect(clearPreferencesFn).toHaveBeenCalledOnce();
      expect(screen.getByRole('status')).toHaveTextContent('Cleared.');
    });

    it('says so when the browser will not let it clear', async () => {
      render(<AccountScreen getMyAccountFn={account} clearPreferencesFn={() => false} />);

      await screen.findByText('First generation');
      fireEvent.click(screen.getByRole('button', { name: 'Clear what this browser remembers' }));

      expect(screen.getByRole('alert')).toHaveTextContent('wouldn’t let us clear it');
    });

    it('really removes the remembered choices by default', async () => {
      localStorage.setItem('owCollapsedGroups', '["war"]');
      localStorage.setItem('owDismissedSources', '["nature"]');
      render(<AccountScreen getMyAccountFn={account} />);

      await screen.findByText('First generation');
      fireEvent.click(screen.getByRole('button', { name: 'Clear what this browser remembers' }));

      expect(localStorage.getItem('owCollapsedGroups')).toBeNull();
      expect(localStorage.getItem('owDismissedSources')).toBeNull();
    });
  });
});
