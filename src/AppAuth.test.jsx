import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  });

  it('toggles from SignUp to LogIn and back', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Already have an account? Log in' }));

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Have an invite key? Create your account' }));

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeVisible();
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

  it('clears the draw and returns to login before a fresh sign-in', async () => {
    render(<App />);

    expect(await screen.findByText('Your account')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    expect(screen.getByText('Single Card')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tony@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Systems Thinking Tarot' })).toBeVisible();
  });

  it('ignores an older auth refresh after logout and a fresh sign-in', async () => {
    let rejectStaleRefresh;
    render(<App />);

    expect(await screen.findByText('Your account')).toBeVisible();
    getCurrentUser.mockImplementationOnce(() => new Promise((_, reject) => { rejectStaleRefresh = reject; }));
    Hub.listen.mock.calls[0][1]();

    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tony@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Your account')).toBeVisible();

    rejectStaleRefresh(new Error('stale signed-out result'));
    await waitFor(() => expect(screen.getByText('Your account')).toBeVisible());
  });
});
