import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from 'aws-amplify/auth';
import App from './App';

vi.mock('aws-amplify/auth', () => ({
  confirmSignUp: vi.fn(),
  getCurrentUser: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

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
