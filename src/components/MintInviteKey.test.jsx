import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MintInviteKey from './MintInviteKey';

const originalClipboard = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  });
});

describe('MintInviteKey', () => {
  it('renders the Mint Key action', () => {
    render(<MintInviteKey />);

    expect(screen.getByRole('button', { name: 'Mint Key' })).toBeVisible();
  });

  it('submits only once across rapid repeated clicks', () => {
    const mintFn = vi.fn(() => new Promise(() => {}));
    render(<MintInviteKey mintFn={mintFn} />);
    const button = screen.getByRole('button', { name: 'Mint Key' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(mintFn).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
  });

  it('shows the code and keeps Mint Key available after success', async () => {
    const mintFn = vi.fn().mockResolvedValue('ABCD-EFGH-JKMP');
    render(<MintInviteKey mintFn={mintFn} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mint Key' }));

    expect(await screen.findByText('ABCD-EFGH-JKMP')).toBeVisible();
    expect(screen.getByLabelText('Invite Key code')).toHaveClass('select-all');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mint Key' })).toBeEnabled();
  });

  it('replaces the previous code when minting again', async () => {
    const mintFn = vi.fn()
      .mockResolvedValueOnce('ABCD-EFGH-JKMP')
      .mockResolvedValueOnce('QRST-UVWX-YZ23');
    render(<MintInviteKey mintFn={mintFn} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mint Key' }));
    expect(await screen.findByText('ABCD-EFGH-JKMP')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Mint Key' }));
    expect(await screen.findByText('QRST-UVWX-YZ23')).toBeVisible();
    expect(screen.queryByText('ABCD-EFGH-JKMP')).not.toBeInTheDocument();
    expect(mintFn).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable inline error when minting fails', async () => {
    const mintFn = vi.fn().mockRejectedValue(new Error('service unavailable'));
    render(<MintInviteKey mintFn={mintFn} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mint Key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't mint an Invite Key. Please try again.",
    );
    expect(screen.getByRole('button', { name: 'Mint Key' })).toBeEnabled();
  });

  it('reports clipboard failure without hiding the code', async () => {
    const mintFn = vi.fn().mockResolvedValue('ABCD-EFGH-JKMP');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<MintInviteKey mintFn={mintFn} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mint Key' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Copy failed. Select the key and copy it manually.',
      );
    });
    expect(screen.getByText('ABCD-EFGH-JKMP')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mint Key' })).toBeEnabled();
  });
});
