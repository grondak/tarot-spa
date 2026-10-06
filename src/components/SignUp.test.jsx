import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SignUp from './SignUp';

function renderForm(status) {
  const checkInviteKeyFn = vi.fn().mockResolvedValue(status);
  const signUpFn = vi.fn();

  render(<SignUp checkInviteKeyFn={checkInviteKeyFn} signUpFn={signUpFn} />);
  fireEvent.change(screen.getByLabelText('Invite Key'), { target: { value: 'TEST-KEY' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A-valid-password1!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  return { checkInviteKeyFn, signUpFn };
}

async function reachConfirmationStep({ signUpFn, signInFn, resendSignUpCodeFn } = {}) {
  const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
  const resolvedSignUpFn = signUpFn ?? vi.fn().mockResolvedValue({ nextStep: { signUpStep: 'CONFIRM_SIGN_UP' } });
  const confirmSignUpFn = vi.fn().mockResolvedValue({ isSignUpComplete: true, nextStep: { signUpStep: 'DONE' } });
  const resolvedSignInFn = signInFn ?? vi.fn().mockResolvedValue({ isSignedIn: true });
  const resolvedResendSignUpCodeFn = resendSignUpCodeFn ?? vi.fn().mockResolvedValue({});
  const onConfirmed = vi.fn();

  render(
    <SignUp
      checkInviteKeyFn={checkInviteKeyFn}
      signUpFn={resolvedSignUpFn}
      confirmSignUpFn={confirmSignUpFn}
      resendSignUpCodeFn={resolvedResendSignUpCodeFn}
      signInFn={resolvedSignInFn}
      onConfirmed={onConfirmed}
    />,
  );

  fireEvent.change(screen.getByLabelText('Invite Key'), { target: { value: 'FIRST-GEN-TEST' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A-valid-password1!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByLabelText('Confirmation code');

  return {
    checkInviteKeyFn,
    signUpFn: resolvedSignUpFn,
    confirmSignUpFn,
    resendSignUpCodeFn: resolvedResendSignUpCodeFn,
    signInFn: resolvedSignInFn,
    onConfirmed,
  };
}

describe('SignUp invite-key validation', () => {
  it.each([
    [null, "This key isn't valid"],
    ['redeemed', "This key's already been used"],
    ['revoked', 'This key was revoked'],
  ])('shows the exact rejection message for %s', async (status, message) => {
    const { signUpFn } = renderForm(status);

    expect(await screen.findByText(message)).toBeVisible();
    expect(signUpFn).not.toHaveBeenCalled();
  });

  it('passes the invite key through Cognito client metadata', async () => {
    const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
    const signUpFn = vi.fn().mockResolvedValue({ nextStep: { signUpStep: 'CONFIRM_SIGN_UP' } });
    render(<SignUp checkInviteKeyFn={checkInviteKeyFn} signUpFn={signUpFn} />);

    fireEvent.change(screen.getByLabelText('Invite Key'), { target: { value: ' FIRST-GEN-TEST ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A-valid-password1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(signUpFn).toHaveBeenCalledWith({
      username: 'friend@example.com',
      password: 'A-valid-password1!',
      options: {
        userAttributes: { email: 'friend@example.com' },
        clientMetadata: { inviteKeyCode: 'FIRST-GEN-TEST' },
      },
    }));
    expect(await screen.findByLabelText('Confirmation code')).toBeVisible();
  });

  it('shows a friendly message instead of raw Cognito error text', async () => {
    const checkInviteKeyFn = vi.fn().mockResolvedValue('unredeemed');
    const signUpFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('User already exists'), { name: 'UsernameExistsException' }),
    );
    render(<SignUp checkInviteKeyFn={checkInviteKeyFn} signUpFn={signUpFn} />);

    fireEvent.change(screen.getByLabelText('Invite Key'), { target: { value: 'FIRST-GEN-TEST' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A-valid-password1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('An account already exists for that email.')).toBeVisible();
  });

  it('shows a distinct message when the invite-key check itself fails, not an account-creation error', async () => {
    const checkInviteKeyFn = vi.fn().mockRejectedValue(new Error('network error'));
    const signUpFn = vi.fn();
    render(<SignUp checkInviteKeyFn={checkInviteKeyFn} signUpFn={signUpFn} />);

    fireEvent.change(screen.getByLabelText('Invite Key'), { target: { value: 'FIRST-GEN-TEST' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A-valid-password1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Could not check your invite key right now. Please try again.')).toBeVisible();
    expect(signUpFn).not.toHaveBeenCalled();
  });
});

describe('SignUp confirmation step', () => {
  it('signs in with the held credentials and calls onConfirmed once the confirmation code is accepted', async () => {
    const { confirmSignUpFn, signInFn, onConfirmed } = await reachConfirmationStep();

    fireEvent.change(screen.getByLabelText('Confirmation code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm account' }));

    await waitFor(() => expect(confirmSignUpFn).toHaveBeenCalledWith({
      username: 'friend@example.com',
      confirmationCode: '123456',
      // The PostConfirmation trigger only receives clientMetadata from confirmSignUp,
      // not from the earlier signUp call — the invite key must be re-sent here.
      options: { clientMetadata: { inviteKeyCode: 'FIRST-GEN-TEST' } },
    }));
    await waitFor(() => expect(signInFn).toHaveBeenCalledWith({
      username: 'friend@example.com',
      password: 'A-valid-password1!',
    }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
  });

  it('resends the confirmation code and shows a confirmation notice', async () => {
    const resendSignUpCodeFn = vi.fn().mockResolvedValue({});
    await reachConfirmationStep({ resendSignUpCodeFn });

    fireEvent.click(screen.getByRole('button', { name: /resend it/i }));

    await waitFor(() => expect(resendSignUpCodeFn).toHaveBeenCalledWith({ username: 'friend@example.com' }));
    expect(await screen.findByText(/sent a new confirmation code/i)).toBeVisible();
  });

  it('shows a friendly error when resending the code fails', async () => {
    const resendSignUpCodeFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('too many requests'), { name: 'LimitExceededException' }),
    );
    await reachConfirmationStep({ resendSignUpCodeFn });

    fireEvent.click(screen.getByRole('button', { name: /resend it/i }));

    expect(await screen.findByText('Too many attempts — wait a moment and try again.')).toBeVisible();
  });

  it('lets the user go back to fix a mistyped email', async () => {
    await reachConfirmationStep();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(await screen.findByLabelText('Invite Key')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveValue('friend@example.com');
  });

  it('does not fake an authenticated state when the post-confirmation sign-in fails', async () => {
    const signInFn = vi.fn().mockRejectedValue(new Error('user no longer exists'));
    const { onConfirmed } = await reachConfirmationStep({ signInFn });

    fireEvent.change(screen.getByLabelText('Confirmation code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm account' }));

    expect(await screen.findByText(/couldn't sign you in automatically/)).toBeVisible();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
