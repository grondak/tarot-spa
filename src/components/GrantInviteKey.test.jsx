import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GrantInviteKey from './GrantInviteKey';

const originalClipboard = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
});

describe('GrantInviteKey', () => {
  it('renders nothing for a SecondGen account', () => {
    const { container } = render(
      <GrantInviteKey account={{ generation: 'SecondGen', onwardKeyGenerated: false }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the action for an eligible FirstGen account', () => {
    render(<GrantInviteKey account={{ generation: 'FirstGen', onwardKeyGenerated: false }} />);

    expect(screen.getByRole('button', { name: 'Grant Invite Key' })).toBeVisible();
  });

  it('submits only once across rapid repeated clicks', () => {
    const mintOnwardKeyFn = vi.fn(() => new Promise(() => {}));
    render(
      <GrantInviteKey
        account={{ generation: 'FirstGen', onwardKeyGenerated: false }}
        mintOnwardKeyFn={mintOnwardKeyFn}
      />,
    );
    const button = screen.getByRole('button', { name: 'Grant Invite Key' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(mintOnwardKeyFn).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
  });

  it('shows the one-time code after a successful mint', async () => {
    const mintOnwardKeyFn = vi.fn().mockResolvedValue('ABCD-EFGH-JKMP');
    render(
      <GrantInviteKey
        account={{ generation: 'FirstGen', onwardKeyGenerated: false }}
        mintOnwardKeyFn={mintOnwardKeyFn}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant Invite Key' }));

    expect(await screen.findByText('ABCD-EFGH-JKMP')).toBeVisible();
    expect(screen.getByLabelText('Invite Key code')).toHaveClass('select-all');
    expect(screen.getByText(/copy it now/i)).toBeVisible();
  });

  it('shows plain confirmation when the key was already granted', () => {
    render(<GrantInviteKey account={{ generation: 'FirstGen', onwardKeyGenerated: true }} />);

    expect(screen.getByText("You've already granted your key")).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refreshes stale eligibility after a lost mint race without showing a raw error', async () => {
    const mintOnwardKeyFn = vi.fn().mockRejectedValue(new Error('not eligible'));
    const refreshAccountFn = vi.fn().mockResolvedValue({
      generation: 'FirstGen',
      onwardKeyGenerated: true,
    });
    render(
      <GrantInviteKey
        account={{ generation: 'FirstGen', onwardKeyGenerated: false }}
        mintOnwardKeyFn={mintOnwardKeyFn}
        refreshAccountFn={refreshAccountFn}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant Invite Key' }));

    await waitFor(() => expect(refreshAccountFn).toHaveBeenCalledOnce());
    expect(await screen.findByText("You've already granted your key")).toBeVisible();
    expect(screen.queryByText('not eligible')).not.toBeInTheDocument();
  });

  it('shows a retryable error when stale eligibility cannot be refreshed', async () => {
    const mintOnwardKeyFn = vi.fn().mockRejectedValue(new Error('not eligible'));
    const refreshAccountFn = vi.fn().mockRejectedValue(new Error('network down'));
    render(
      <GrantInviteKey
        account={{ generation: 'FirstGen', onwardKeyGenerated: false }}
        mintOnwardKeyFn={mintOnwardKeyFn}
        refreshAccountFn={refreshAccountFn}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant Invite Key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('refresh your account');
    expect(screen.getByRole('button', { name: 'Grant Invite Key' })).toBeEnabled();
  });

  it('does not treat a still-eligible refresh as resolved after not-eligible', async () => {
    const mintOnwardKeyFn = vi.fn().mockRejectedValue(new Error('not eligible'));
    const refreshAccountFn = vi.fn().mockResolvedValue({
      generation: 'FirstGen',
      onwardKeyGenerated: false,
    });
    render(
      <GrantInviteKey
        account={{ generation: 'FirstGen', onwardKeyGenerated: false }}
        mintOnwardKeyFn={mintOnwardKeyFn}
        refreshAccountFn={refreshAccountFn}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant Invite Key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('confirm your Invite Key status');
    expect(screen.getByRole('button', { name: 'Grant Invite Key' })).toBeEnabled();
  });

  it('handles non-Error mutation rejections', async () => {
    const mintOnwardKeyFn = vi.fn().mockRejectedValue('service unavailable');
    render(
      <GrantInviteKey
        account={{ generation: 'FirstGen', onwardKeyGenerated: false }}
        mintOnwardKeyFn={mintOnwardKeyFn}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant Invite Key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
  });

  it('reports clipboard failures without hiding the one-time code', async () => {
    const mintOnwardKeyFn = vi.fn().mockResolvedValue('ABCD-EFGH-JKMP');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(
      <GrantInviteKey
        account={{ generation: 'FirstGen', onwardKeyGenerated: false }}
        mintOnwardKeyFn={mintOnwardKeyFn}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant Invite Key' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('copy it manually');
    expect(screen.getByText('ABCD-EFGH-JKMP')).toBeVisible();
  });
});
