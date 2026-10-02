import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RevokeInviteKey from './RevokeInviteKey';

function typeCode(value) {
  fireEvent.change(screen.getByLabelText('Invite Key code'), { target: { value } });
}

function clickCheck() {
  fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
}

function clickRevoke() {
  fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));
}

describe('RevokeInviteKey', () => {
  it('shows an inline error and makes zero calls for a blank-code Check key attempt', () => {
    const checkInviteKeyFn = vi.fn();
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} />);

    clickCheck();

    expect(screen.getByRole('alert')).toHaveTextContent('Enter an Invite Key code first.');
    expect(checkInviteKeyFn).not.toHaveBeenCalled();
  });

  it.each([
    ['unredeemed', 'This key is unredeemed — ready to revoke.', true],
    ['redeemed', "This key has already been redeemed — it can't be revoked.", false],
    ['revoked', 'This key has already been revoked.', false],
    [null, 'No Invite Key found with that code.', false],
  ])('renders the exact mapped text for a %s lookup, Revoke button present: %s', async (status, message, revokeButtonPresent) => {
    const checkInviteKeyFn = vi.fn().mockResolvedValue(status);
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} />);

    typeCode('ABCD-EFGH-JKMP');
    clickCheck();

    expect(await screen.findByRole('status')).toHaveTextContent(message);
    expect(checkInviteKeyFn).toHaveBeenCalledWith('ABCD-EFGH-JKMP');
    if (revokeButtonPresent) {
      expect(screen.getByRole('button', { name: 'Revoke key' })).toBeVisible();
    } else {
      expect(screen.queryByRole('button', { name: 'Revoke key' })).not.toBeInTheDocument();
    }
  });

  it('trims the code before checking it', async () => {
    const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} />);

    typeCode('  ABCD-EFGH-JKMP  ');
    clickCheck();

    await screen.findByRole('status');
    expect(checkInviteKeyFn).toHaveBeenCalledWith('ABCD-EFGH-JKMP');
  });

  it('shows a clear alert when the lookup itself fails', async () => {
    const checkInviteKeyFn = vi.fn().mockRejectedValue(new Error('network unavailable'));
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} />);

    typeCode('ABCD-EFGH-JKMP');
    clickCheck();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't check this key. Please try again.");
    expect(screen.queryByRole('button', { name: 'Revoke key' })).not.toBeInTheDocument();
  });

  it('makes exactly one call on a rapid double-click of Check key', async () => {
    let resolveCheck;
    const checkInviteKeyFn = vi.fn(() => new Promise((resolve) => { resolveCheck = resolve; }));
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} />);

    typeCode('ABCD-EFGH-JKMP');
    const button = screen.getByRole('button', { name: 'Check key' });
    fireEvent.click(button);
    fireEvent.click(button);
    resolveCheck('unredeemed');

    await screen.findByRole('status');
    expect(checkInviteKeyFn).toHaveBeenCalledOnce();
  });

  it('makes exactly one call on a rapid double-click of Revoke key', async () => {
    const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
    let resolveRevoke;
    const revokeInviteKeyFn = vi.fn(() => new Promise((resolve) => { resolveRevoke = resolve; }));
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} revokeInviteKeyFn={revokeInviteKeyFn} />);

    typeCode('ABCD-EFGH-JKMP');
    clickCheck();
    const button = await screen.findByRole('button', { name: 'Revoke key' });

    fireEvent.click(button);
    fireEvent.click(button);
    resolveRevoke(true);

    await screen.findByText('Invite Key revoked.');
    expect(revokeInviteKeyFn).toHaveBeenCalledOnce();
  });

  it('announces success, flips the status to already-revoked, and hides the Revoke button', async () => {
    const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
    const revokeInviteKeyFn = vi.fn().mockResolvedValue(true);
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} revokeInviteKeyFn={revokeInviteKeyFn} />);

    typeCode('ABCD-EFGH-JKMP');
    clickCheck();
    await screen.findByRole('button', { name: 'Revoke key' });
    clickRevoke();

    await waitFor(() => {
      const statuses = screen.getAllByRole('status').map((el) => el.textContent);
      expect(statuses).toContain('Invite Key revoked.');
      expect(statuses).toContain('This key has already been revoked.');
    });
    expect(screen.queryByRole('button', { name: 'Revoke key' })).not.toBeInTheDocument();
    expect(revokeInviteKeyFn).toHaveBeenCalledWith('ABCD-EFGH-JKMP');
  });

  it.each([
    ['INVITE_KEY_NOT_FOUND', 'No Invite Key found with that code.'],
    ['INVITE_KEY_ALREADY_REDEEMED', "This key has already been redeemed — it can't be revoked."],
    ['INVITE_KEY_ALREADY_REVOKED', 'This key has already been revoked.'],
  ])('maps the %s revoke failure to its exact message and leaves the key revocable again', async (code, message) => {
    const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
    const revokeInviteKeyFn = vi.fn().mockRejectedValue(new Error(code));
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} revokeInviteKeyFn={revokeInviteKeyFn} />);

    typeCode('ABCD-EFGH-JKMP');
    clickCheck();
    await screen.findByRole('button', { name: 'Revoke key' });
    clickRevoke();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Revoke key' })).toBeVisible();
  });

  it('renders the generic retry message for an unrecognized revoke error', async () => {
    const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
    const revokeInviteKeyFn = vi.fn().mockRejectedValue(new Error('network unavailable'));
    render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} revokeInviteKeyFn={revokeInviteKeyFn} />);

    typeCode('ABCD-EFGH-JKMP');
    clickCheck();
    await screen.findByRole('button', { name: 'Revoke key' });
    clickRevoke();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't revoke this key. Please try again.");
  });

  it('causes no stale update after unmount during a pending Check key', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveCheck;
    const checkInviteKeyFn = vi.fn(() => new Promise((resolve) => { resolveCheck = resolve; }));
    const { unmount } = render(<RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} />);

    typeCode('ABCD-EFGH-JKMP');
    clickCheck();
    unmount();
    resolveCheck('unredeemed');

    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('causes no stale update after unmount during a pending Revoke key', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
    let resolveRevoke;
    const revokeInviteKeyFn = vi.fn(() => new Promise((resolve) => { resolveRevoke = resolve; }));
    const { unmount } = render(
      <RevokeInviteKey checkInviteKeyFn={checkInviteKeyFn} revokeInviteKeyFn={revokeInviteKeyFn} />,
    );

    typeCode('ABCD-EFGH-JKMP');
    clickCheck();
    await screen.findByRole('button', { name: 'Revoke key' });
    clickRevoke();
    unmount();
    resolveRevoke(true);

    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
