import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LogIn from './LogIn';

function submitLogIn({ signInFn, onSignedIn = vi.fn() }) {
  render(<LogIn signInFn={signInFn} onSignedIn={onSignedIn} />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' friend@example.com ' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  return { onSignedIn };
}

function authError(name) {
  return Object.assign(new Error(name), { name });
}

describe('LogIn', () => {
  it('signs in with trimmed credentials and reports success', async () => {
    const signInFn = vi.fn().mockResolvedValue({ isSignedIn: true });
    const { onSignedIn } = submitLogIn({ signInFn });

    await waitFor(() => expect(signInFn).toHaveBeenCalledWith({
      username: 'friend@example.com',
      password: 'correct-password',
    }));
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it.each(['NotAuthorizedException', 'UserNotFoundException'])(
    'uses existence-safe copy for %s',
    async (name) => {
      const signInFn = vi.fn().mockRejectedValue(authError(name));
      const { onSignedIn } = submitLogIn({ signInFn });

      expect(await screen.findByText('Incorrect email or password.')).toBeVisible();
      expect(onSignedIn).not.toHaveBeenCalled();
    },
  );

  it('explains an unfinished account without authenticating', async () => {
    const signInFn = vi.fn().mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_UP' },
    });
    const { onSignedIn } = submitLogIn({ signInFn });

    expect(await screen.findByText(
      "That account was never finished being set up, so it can't be logged into. Ask the person who gave you your invite key — or Tony — for help.",
    )).toBeVisible();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('treats an already-authenticated exception as success', async () => {
    const signInFn = vi.fn().mockRejectedValue(authError('UserAlreadyAuthenticatedException'));
    const { onSignedIn } = submitLogIn({ signInFn });

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
  });

  it('uses rate-limit copy for Cognito throttling', async () => {
    const signInFn = vi.fn().mockRejectedValue(authError('LimitExceededException'));
    submitLogIn({ signInFn });

    expect(await screen.findByText('Too many attempts — wait a moment and try again.')).toBeVisible();
  });

  it('uses fallback copy for a non-Error rejection', async () => {
    const signInFn = vi.fn().mockRejectedValue(null);
    const { onSignedIn } = submitLogIn({ signInFn });

    expect(await screen.findByText("Couldn't sign in. Please try again.")).toBeVisible();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('uses fallback copy for an unrecognized next step', async () => {
    const signInFn = vi.fn().mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'RESET_PASSWORD' },
    });
    submitLogIn({ signInFn });

    expect(await screen.findByText("Couldn't sign in. Please try again.")).toBeVisible();
  });

  it('submits only once across rapid repeated clicks', () => {
    const signInFn = vi.fn(() => new Promise(() => {}));
    render(<LogIn signInFn={signInFn} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
    const button = screen.getByRole('button', { name: 'Log in' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(signInFn).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
  });
});
