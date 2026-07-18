import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser, signIn, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import App from './App';
import { getMyAccount } from './utils/account';

vi.mock('aws-amplify/auth', () => ({
  confirmSignUp: vi.fn(),
  getCurrentUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('./utils/account', () => ({ getMyAccount: vi.fn() }));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

describe('App unauthenticated screens', () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    getCurrentUser.mockRejectedValue(new Error('not signed in'));
    Hub.listen.mockClear();
  });

  it('opens SignUp from the landing and keeps the SignUp and LogIn cross-links', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Systems Thinking Tarot' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'I have an Invite Key' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Log In' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'I have an Invite Key' }));

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Already have an account? Log in' }));

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Have an invite key? Create your account' }));

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });

  it('preserves an active auth screen when an auth refresh remains unauthenticated', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Log In' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tony@example.com' } });

    await act(async () => {
      await Hub.listen.mock.calls[0][1]();
    });

    expect(getCurrentUser).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveValue('tony@example.com');
  });
});

describe('App authenticated sign-out round trip', () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    getMyAccount.mockReset();
    signIn.mockReset();
    signOut.mockReset();
    Hub.listen.mockClear();
    getCurrentUser.mockResolvedValue({ username: 'tony' });
    getMyAccount.mockResolvedValue({ generation: 'SecondGen', onwardKeyGenerated: false });
    signOut.mockResolvedValue();
    signIn.mockResolvedValue({ isSignedIn: true });
  });

  it('clears the draw and returns to the landing before a fresh sign-in', async () => {
    render(<App />);

    expect(await screen.findByText('Your account')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Draw for fun instead' }));
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    expect(screen.getByText('Single Card')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await screen.findByRole('button', { name: 'I have an Invite Key' })).toBeVisible();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tony@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Your account')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'I have an Invite Key' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Draw Again' })).not.toBeInTheDocument();
  });

  it('ignores an older auth refresh after logout and a fresh sign-in', async () => {
    let rejectStaleRefresh;
    render(<App />);

    expect(await screen.findByText('Your account')).toBeVisible();
    getCurrentUser.mockImplementationOnce(() => new Promise((_, reject) => { rejectStaleRefresh = reject; }));
    Hub.listen.mock.calls[0][1]();

    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await screen.findByRole('button', { name: 'I have an Invite Key' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tony@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Your account')).toBeVisible();

    rejectStaleRefresh(new Error('stale signed-out result'));
    await waitFor(() => expect(screen.getByText('Your account')).toBeVisible());
  });

  it('returns to the landing when an auth refresh detects session loss', async () => {
    render(<App />);

    expect(await screen.findByText('Your account')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Draw for fun instead' }));
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    expect(screen.getByRole('button', { name: 'Draw Again' })).toBeVisible();
    getCurrentUser.mockRejectedValueOnce(new Error('session expired'));
    Hub.listen.mock.calls[0][1]();

    expect(await screen.findByRole('button', { name: 'I have an Invite Key' })).toBeVisible();
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tony@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Your account')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Draw Again' })).not.toBeInTheDocument();
  });

  it('shows Context Entry as the authenticated home and round-trips a deliberate quick draw', async () => {
    render(<App />);

    expect(await screen.findByText('Your account')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    expect(screen.getByLabelText('Context')).toHaveAttribute(
      'placeholder',
      'Tell me about your upcoming decision, and what you know or think you know about the situation.',
    );
    expect(screen.getByRole('button', { name: 'Help Me Orient' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Draw for fun instead' }));
    expect(screen.getByRole('heading', { name: 'Quick Draw' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    expect(screen.getByRole('button', { name: 'Draw Again' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Help Me Orient' })).toBeDisabled();
  });
});
