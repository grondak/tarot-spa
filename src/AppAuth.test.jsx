import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser, signIn, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import App from './App';
import { getMyAccount } from './utils/account';
import {
  getSession,
  getOrientationStatus,
  startOrientationGuide,
} from './utils/orientation';

vi.mock('aws-amplify/auth', () => ({
  confirmSignUp: vi.fn(),
  getCurrentUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('./utils/account', () => ({ getMyAccount: vi.fn() }));
vi.mock('./utils/orientation', async (importOriginal) => ({
  ...await importOriginal(),
  getSession: vi.fn(),
  getOrientationStatus: vi.fn(),
  startOrientationGuide: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

const POSITIONS = {
  single: ['Draw'],
  decision: ['Current State', 'Path A', 'Path B', 'Integration'],
};

function resultCards(spreadKey) {
  return POSITIONS[spreadKey].map((position) => ({
    name: 'The Fool',
    position,
    inverted: false,
  }));
}

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
    getSession.mockReset();
    getOrientationStatus.mockReset();
    startOrientationGuide.mockReset();
    signIn.mockReset();
    signOut.mockReset();
    Hub.listen.mockClear();
    localStorage.clear();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '12345678-1234-4234-9234-123456789012',
    );
    getCurrentUser.mockResolvedValue({ username: 'tony' });
    getMyAccount.mockResolvedValue({ generation: 'SecondGen', onwardKeyGenerated: false });
    startOrientationGuide.mockResolvedValue({
      sessionId: '12345678-1234-4234-9234-123456789012',
      status: 'PENDING',
    });
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      spreadKey: 'single',
      context: 'A decision.',
      status: 'SUCCEEDED',
      cards: resultCards('single'),
      currentEvents: [],
      guide: 'The generated guide.',
      tavilyTimedOut: false,
    });
    getOrientationStatus.mockResolvedValue({ limitExhausted: false });
    signOut.mockResolvedValue();
    signIn.mockResolvedValue({ isSignedIn: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it('renders Rate-Limited Intake when the daily status is exhausted', async () => {
    getOrientationStatus.mockResolvedValue({ limitExhausted: true });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Quick Draw', exact: true })).toBeVisible();
    expect(screen.getByText(/You're tapped out on Orientation Guides for today/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Help Me Orient', exact: true })).not.toBeInTheDocument();
  });

  it('fails open to normal Context Entry when status loading fails', async () => {
    getOrientationStatus.mockRejectedValue(new Error('status unavailable'));
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Help Me Orient', exact: true })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Help Me Orient', exact: true })).toBeDisabled();
  });

  it('starts once, follows PENDING to SUCCEEDED, and retains the exact active ID', async () => {
    vi.useFakeTimers();
    getSession
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        status: 'PENDING',
      })
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        spreadKey: 'decision',
        context: 'A consequential choice.',
        status: 'SUCCEEDED',
        cards: resultCards('decision'),
        currentEvents: [],
        guide: 'The generated guide.',
        tavilyTimedOut: false,
      });
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), {
      target: { value: '  A consequential choice.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Decision/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.runAllTicks());

    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the cards and the world...',
    );
    expect(startOrientationGuide).toHaveBeenCalledWith(
      '12345678-1234-4234-9234-123456789012',
      'A consequential choice.',
      'decision',
    );
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBe(
      '12345678-1234-4234-9234-123456789012',
    );

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText('The generated guide.')).toBeVisible();
    expect(startOrientationGuide).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledWith('12345678-1234-4234-9234-123456789012');
    expect(getOrientationStatus).toHaveBeenCalledTimes(2);
  });

  it('retries a transient exact-Session read failure without changing the active ID', async () => {
    vi.useFakeTimers();
    getSession
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        spreadKey: 'single',
        context: 'A decision.',
        status: 'SUCCEEDED',
        cards: resultCards('single'),
        currentEvents: [],
        guide: 'Recovered after a read retry.',
        tavilyTimedOut: false,
      });
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.runAllTicks());

    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the cards and the world...',
    );
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBe(
      '12345678-1234-4234-9234-123456789012',
    );

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText('Recovered after a read retry.')).toBeVisible();
    expect(startOrientationGuide).toHaveBeenCalledTimes(1);
  });

  it('maps a FAILED daily limit to Rate-Limited Intake and clears the active ID', async () => {
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      status: 'FAILED',
      errorCode: 'DAILY_LIMIT_EXHAUSTED',
    });
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));

    expect(await screen.findByRole('heading', { name: 'Quick Draw', exact: true })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();
  });

  it('ignores an initial aggregate-status response that resolves after a Daily-limit failure', async () => {
    let resolveInitialStatus;
    getOrientationStatus.mockImplementationOnce(() => new Promise((resolve) => {
      resolveInitialStatus = resolve;
    }));
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      status: 'FAILED',
      errorCode: 'DAILY_LIMIT_EXHAUSTED',
    });
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Quick Draw', exact: true })).toBeVisible();

    await act(async () => resolveInitialStatus({ limitExhausted: false }));

    expect(screen.getByRole('heading', { name: 'Quick Draw', exact: true })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Help Me Orient', exact: true }))
      .not.toBeInTheDocument();
  });

  it('uses a synchronous guard against rapid duplicate Orientation submissions', async () => {
    startOrientationGuide.mockImplementation(() => new Promise(() => {}));
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'One paid request.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    const form = screen.getByRole('button', { name: 'Help Me Orient', exact: true }).closest('form');
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(startOrientationGuide).toHaveBeenCalledOnce();
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it('maps a FAILED monthly limit inline while preserving Context and clears the ID', async () => {
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      status: 'FAILED',
      errorCode: 'MONTHLY_BUDGET_EXHAUSTED',
    });
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'Keep this context.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Everyone's shared monthly Guide budget is spent — Orientation Guides return when the month rolls over. Quick Draw is always free.",
    );
    expect(screen.getByLabelText('Context')).toHaveValue('Keep this context.');
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();
  });

  it('continues the exact Session after an ambiguous ack without a second mutation', async () => {
    vi.useFakeTimers();
    startOrientationGuide.mockRejectedValue(new Error('ack connection lost'));
    getSession
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        status: 'RUNNING',
      })
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        spreadKey: 'decision',
        context: 'A decision.',
        status: 'SUCCEEDED',
        cards: resultCards('decision'),
        currentEvents: [],
        guide: 'Recovered exact Session.',
        tavilyTimedOut: false,
      });
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Decision/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.advanceTimersByTimeAsync(5000));

    expect(screen.getByText('Recovered exact Session.')).toBeVisible();
    expect(startOrientationGuide).toHaveBeenCalledTimes(1);
  });

  it('retries the starter once with the same ID when ambiguous recovery finds PENDING', async () => {
    vi.useFakeTimers();
    startOrientationGuide
      .mockRejectedValueOnce(new Error('ack connection lost'))
      .mockResolvedValueOnce({
        sessionId: '12345678-1234-4234-9234-123456789012',
        status: 'PENDING',
      });
    getSession
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        status: 'PENDING',
      })
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        spreadKey: 'decision',
        context: 'A decision.',
        status: 'SUCCEEDED',
        cards: resultCards('decision'),
        currentEvents: [],
        guide: 'Healed orphan Session.',
        tavilyTimedOut: false,
      });
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Decision/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.advanceTimersByTimeAsync(5000));

    expect(screen.getByText('Healed orphan Session.')).toBeVisible();
    expect(startOrientationGuide).toHaveBeenCalledTimes(2);
    expect(startOrientationGuide.mock.calls).toEqual([
      [
        '12345678-1234-4234-9234-123456789012',
        'A decision.',
        'decision',
      ],
      [
        '12345678-1234-4234-9234-123456789012',
        'A decision.',
        'decision',
      ],
    ]);
  });

  it('keeps the same ID when ambiguous recovery first hits a transient read failure', async () => {
    vi.useFakeTimers();
    startOrientationGuide
      .mockRejectedValueOnce(new Error('ack connection lost'))
      .mockResolvedValueOnce({
        sessionId: '12345678-1234-4234-9234-123456789012',
        status: 'PENDING',
      });
    getSession
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        status: 'PENDING',
      })
      .mockResolvedValueOnce({
        id: '12345678-1234-4234-9234-123456789012',
        spreadKey: 'decision',
        context: 'A decision.',
        status: 'SUCCEEDED',
        cards: resultCards('decision'),
        currentEvents: [],
        guide: 'Recovered without a fresh UUID.',
        tavilyTimedOut: false,
      });
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Decision/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(screen.getByText('Recovered without a fresh UUID.')).toBeVisible();
    expect(startOrientationGuide.mock.calls).toHaveLength(2);
    expect(startOrientationGuide.mock.calls.map(([id]) => id)).toEqual([
      '12345678-1234-4234-9234-123456789012',
      '12345678-1234-4234-9234-123456789012',
    ]);
  });

  it('clears a missing ambiguous start and uses a fresh UUID on retry', async () => {
    vi.useFakeTimers();
    const secondId = 'abcdefab-cdef-4abc-9def-abcdefabcdef';
    globalThis.crypto.randomUUID
      .mockReturnValueOnce('12345678-1234-4234-9234-123456789012')
      .mockReturnValueOnce(secondId);
    startOrientationGuide
      .mockRejectedValueOnce(new Error('ack connection lost'))
      .mockResolvedValueOnce({ sessionId: secondId, status: 'PENDING' });
    getSession
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: secondId,
        spreadKey: 'single',
        context: 'Retry me.',
        status: 'SUCCEEDED',
        cards: resultCards('single'),
        currentEvents: [],
        guide: 'Fresh retry result.',
        tavilyTimedOut: false,
      });
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'Retry me.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.',
    );
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.runAllTicks());
    expect(screen.getByText('Fresh retry result.')).toBeVisible();
    expect(startOrientationGuide.mock.calls.map(([id]) => id)).toEqual([
      '12345678-1234-4234-9234-123456789012',
      secondId,
    ]);
  });

  it('ends a never-terminal exact Session at 300 seconds with the generic error', async () => {
    vi.useFakeTimers();
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      status: 'RUNNING',
    });
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Decision/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.advanceTimersByTimeAsync(300000));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your Guide is taking longer than expected. We kept this request so you can check it again; usage may already have been reserved.',
    );
    expect(screen.getByRole('button', { name: 'Check this request again' })).toBeVisible();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBe(
      '12345678-1234-4234-9234-123456789012',
    );
    expect(startOrientationGuide).toHaveBeenCalledTimes(1);

    getSession.mockResolvedValueOnce({
      id: '12345678-1234-4234-9234-123456789012',
      spreadKey: 'decision',
      context: 'A decision.',
      status: 'SUCCEEDED',
      cards: resultCards('decision'),
      currentEvents: [],
      guide: 'Recovered after the observation timeout.',
      tavilyTimedOut: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check this request again' }));
    await act(async () => vi.runAllTicks());
    expect(screen.getByText('Recovered after the observation timeout.')).toBeVisible();
  });

  it('applies the same 300-second deadline when the starter acknowledgment never settles', async () => {
    vi.useFakeTimers();
    startOrientationGuide.mockImplementation(() => new Promise(() => {}));
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.advanceTimersByTimeAsync(300_000));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your Guide is taking longer than expected. We kept this request so you can check it again; usage may already have been reserved.',
    );
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBe(
      '12345678-1234-4234-9234-123456789012',
    );
  });

  it('bounds an unresolved exact-Session read and retains its recovery ID', async () => {
    vi.useFakeTimers();
    getSession.mockImplementation(() => new Promise(() => {}));
    render(<App />);

    await act(async () => vi.runAllTicks());
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    await act(async () => vi.advanceTimersByTimeAsync(300_000));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your Guide is taking longer than expected. We kept this request so you can check it again; usage may already have been reserved.',
    );
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBe(
      '12345678-1234-4234-9234-123456789012',
    );
  });

  it('resumes a stored SUCCEEDED or legacy Session without starting again', async () => {
    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      spreadKey: 'single',
      context: 'Stored context.',
      cards: resultCards('single'),
      currentEvents: [],
      guide: 'Restored after reload.',
      tavilyTimedOut: false,
    });
    render(<App />);

    expect(await screen.findByText('Restored after reload.')).toBeVisible();
    expect(startOrientationGuide).not.toHaveBeenCalled();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).not.toBeNull();
  });

  it('resumes a stored RUNNING Session in loading and clears a missing stored ID silently', async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      status: 'RUNNING',
    });
    const { unmount } = render(<App />);
    await act(async () => vi.runAllTicks());

    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the cards and the world...',
    );
    expect(startOrientationGuide).not.toHaveBeenCalled();
    const timersBeforeUnmount = vi.getTimerCount();
    expect(timersBeforeUnmount).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBeLessThan(timersBeforeUnmount);

    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    getSession.mockResolvedValue(null);
    render(<App />);
    await act(async () => vi.runAllTicks());
    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();
  });

  it('keeps a resumed RUNNING Session visible when aggregate status is rate-limited', async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    getOrientationStatus.mockResolvedValue({ limitExhausted: true });
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      status: 'RUNNING',
    });
    render(<App />);
    await act(async () => vi.runAllTicks());

    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the cards and the world...',
    );
    expect(screen.queryByRole('heading', { name: 'Quick Draw' })).not.toBeInTheDocument();
  });

  it('restores exact Session Context when a resumed request fails', async () => {
    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      context: 'Context recovered after reload.',
      spreadKey: 'decision',
      status: 'FAILED',
      errorCode: 'GENERATION_FAILED',
    });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.',
    );
    expect(screen.getByLabelText('Context')).toHaveValue('Context recovered after reload.');
    expect(screen.getByRole('button', { name: /Decision/ }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('restores safe Context and Spread from a malformed-session classification', async () => {
    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    getSession.mockRejectedValue(Object.assign(new Error('MALFORMED_SESSION'), {
      session: {
        id: '12345678-1234-4234-9234-123456789012',
        context: 'Recovered from malformed result.',
        spreadKey: 'decision',
      },
    }));
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.',
    );
    expect(screen.getByLabelText('Context')).toHaveValue('Recovered from malformed result.');
    expect(screen.getByRole('button', { name: /Decision/ }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    { label: 'blank failure code', session: {
      id: '12345678-1234-4234-9234-123456789012',
      status: 'FAILED',
      errorCode: '   ',
    } },
    { label: 'mismatched running id', session: {
      id: 'abcdefab-cdef-4abc-9def-abcdefabcdef',
      status: 'RUNNING',
    } },
  ])('fails safely for a $label', async ({ session }) => {
    getSession.mockResolvedValue(session);
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.',
    );
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();
  });

  it('survives denied localStorage access without starting or crashing sign-out', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(startOrientationGuide).not.toHaveBeenCalled();
    setItem.mockRestore();

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await screen.findByRole('button', { name: 'I have an Invite Key' })).toBeVisible();
  });

  it('cancels a pending exact-Session read on sign-out without stale UI updates', async () => {
    let resolveRead;
    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    getSession.mockImplementation(() => new Promise((resolve) => {
      resolveRead = resolve;
    }));
    render(<App />);

    expect(await screen.findByText('Reading the cards and the world...')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await screen.findByRole('button', { name: 'I have an Invite Key' })).toBeVisible();

    await act(async () => resolveRead({
      id: '12345678-1234-4234-9234-123456789012',
      spreadKey: 'single',
      context: 'Should not render.',
      status: 'SUCCEEDED',
      cards: resultCards('single'),
      currentEvents: [],
      guide: 'Stale result.',
      tavilyTimedOut: false,
    }));

    expect(screen.queryByText('Stale result.')).not.toBeInTheDocument();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();
  });

  it('turns a malformed SUCCEEDED Session into the controlled generic failure', async () => {
    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    getSession.mockResolvedValue({
      id: '12345678-1234-4234-9234-123456789012',
      context: 'Stored context.',
      spreadKey: 'single',
      status: 'SUCCEEDED',
      cards: null,
      currentEvents: [],
      guide: 'Malformed result.',
      tavilyTimedOut: false,
    });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.',
    );
    expect(screen.queryByRole('heading', { name: 'Your Orientation Guide' }))
      .not.toBeInTheDocument();
  });

  it('clears the stored ID on a fresh redraw and sign-out', async () => {
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    expect(await screen.findByText('The generated guide.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Provide another observation' }));
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();

    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    localStorage.setItem('tarotSpaOrientationRedrawContext', 'Discard this draft.');
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await screen.findByRole('button', { name: 'I have an Invite Key' })).toBeVisible();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();
    expect(localStorage.getItem('tarotSpaOrientationRedrawContext')).toBeNull();
  });

  it('returns to a blank Context Entry with no Spread after a fresh redraw', async () => {
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    expect(await screen.findByText('The generated guide.')).toBeVisible();

    localStorage.setItem('tarotSpaOrientationRedrawContext', 'Stale draft.');
    fireEvent.click(screen.getByRole('button', { name: 'Provide another observation' }));

    expect(screen.getByLabelText('Context')).toHaveValue('');
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();
    expect(localStorage.getItem('tarotSpaOrientationRedrawContext')).toBeNull();
  });

  it('wipes the redraw draft on auth loss without an explicit sign-out', async () => {
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    localStorage.setItem('tarotSpaOrientationRedrawContext', 'A decision.');
    getCurrentUser.mockRejectedValue(new Error('token expired'));

    await act(async () => {
      await Hub.listen.mock.calls[0][1]();
    });

    expect(await screen.findByRole('button', { name: 'I have an Invite Key' })).toBeVisible();
    expect(localStorage.getItem('tarotSpaOrientationRedrawContext')).toBeNull();
  });

  it('restores the exact prior Context with no Spread after a tweak redraw reload', async () => {
    const { unmount } = render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    expect(await screen.findByText('The generated guide.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Tweak existing observation' }));

    expect(screen.getByLabelText('Context')).toHaveValue('A decision.');
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();
    expect(localStorage.getItem('tarotSpaOrientationRedrawContext')).toBe('A decision.');

    unmount();
    render(<App />);

    expect(await screen.findByLabelText('Context')).toHaveValue('A decision.');
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
    expect(screen.queryByText('The generated guide.')).not.toBeInTheDocument();
  });

  it('still returns to Context Entry when redraw-draft storage is denied', async () => {
    localStorage.setItem(
      'tarotSpaActiveOrientationSession',
      '12345678-1234-4234-9234-123456789012',
    );
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === 'tarotSpaOrientationRedrawContext') {
        throw new Error('redraw storage denied');
      }
      return originalSetItem.call(this, key, value);
    });
    const { unmount } = render(<App />);

    expect(await screen.findByText('The generated guide.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tweak existing observation' }));

    expect(screen.getByLabelText('Context')).toHaveValue('A decision.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBeNull();

    unmount();
    render(<App />);

    expect(await screen.findByLabelText('Context')).toHaveValue('');
  });

  it.each([
    {
      redrawAction: 'Provide another observation',
      submittedContext: 'A fresh observation.',
    },
    {
      redrawAction: 'Tweak existing observation',
      submittedContext: 'A decision, revised.',
    },
  ])(
    'reuses the normal async submit path after $redrawAction',
    async ({ redrawAction, submittedContext }) => {
      const firstSessionId = '12345678-1234-4234-9234-123456789012';
      const secondSessionId = 'abcdefab-cdef-4abc-9def-abcdefabcdef';
      globalThis.crypto.randomUUID
        .mockReturnValueOnce(firstSessionId)
        .mockReturnValueOnce(secondSessionId);
      startOrientationGuide.mockImplementation(async (sessionId) => ({
        sessionId,
        status: 'PENDING',
      }));
      getSession.mockImplementation(async (sessionId) => ({
        id: sessionId,
        spreadKey: 'single',
        context: sessionId === firstSessionId ? 'A decision.' : submittedContext,
        status: 'SUCCEEDED',
        cards: resultCards('single'),
        currentEvents: [],
        guide: sessionId === firstSessionId
          ? 'The generated guide.'
          : 'The redrawn guide.',
        tavilyTimedOut: false,
      }));
      render(<App />);

      expect(await screen.findByLabelText('Context')).toBeVisible();
      fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
      fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
      expect(await screen.findByText('The generated guide.')).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: redrawAction }));
      fireEvent.change(screen.getByLabelText('Context'), {
        target: { value: submittedContext },
      });
      fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));

      expect(await screen.findByText('The redrawn guide.')).toBeVisible();
      expect(startOrientationGuide).toHaveBeenCalledTimes(2);
      expect(startOrientationGuide.mock.calls).toEqual([
        [firstSessionId, 'A decision.', 'single'],
        [secondSessionId, submittedContext, 'single'],
      ]);
      expect(startOrientationGuide.mock.calls[0][0])
        .not.toBe(startOrientationGuide.mock.calls[1][0]);
      expect(localStorage.getItem('tarotSpaOrientationRedrawContext')).toBeNull();
    },
  );

  it('does not clear another tab\'s newer active ID when leaving an older result', async () => {
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    expect(await screen.findByText('The generated guide.')).toBeVisible();

    const newerSessionId = 'abcdefab-cdef-4abc-9def-abcdefabcdef';
    localStorage.setItem('tarotSpaActiveOrientationSession', newerSessionId);
    fireEvent.click(screen.getByRole('button', { name: 'Provide another observation' }));

    expect(localStorage.getItem('tarotSpaActiveOrientationSession')).toBe(newerSessionId);
  });

  it('ignores a post-success rate-limit refresh after leaving that orientation flow', async () => {
    let resolveStaleStatus;
    getOrientationStatus
      .mockResolvedValueOnce({ limitExhausted: false })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveStaleStatus = resolve;
      }));
    render(<App />);

    expect(await screen.findByLabelText('Context')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'A decision.' } });
    fireEvent.click(screen.getByRole('button', { name: /Single Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Help Me Orient', exact: true }));
    expect(await screen.findByText('The generated guide.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Provide another observation' }));

    await act(async () => resolveStaleStatus({ limitExhausted: true }));

    expect(screen.getByRole('heading', { name: 'Help Me Orient' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Quick Draw' })).not.toBeInTheDocument();
  });
});
