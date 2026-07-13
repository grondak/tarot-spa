import { useRef, useState } from 'react';
import { confirmSignUp, signIn, signUp } from 'aws-amplify/auth';
import { checkInviteKey } from '../utils/inviteKeys';
import Field from './Field';

const KEY_ERRORS = {
  invalid: "This key isn't valid",
  redeemed: "This key's already been used",
  revoked: 'This key was revoked',
};

const AUTH_ERROR_MESSAGES = {
  UsernameExistsException: 'An account already exists for that email.',
  InvalidPasswordException: "That password doesn't meet the requirements — use at least 8 characters, with a number and a symbol.",
  InvalidParameterException: "That email address doesn't look right — double-check it.",
  CodeMismatchException: "That confirmation code doesn't match — check your email and try again.",
  ExpiredCodeException: 'That confirmation code has expired — go back and sign up again to get a new one.',
  LimitExceededException: 'Too many attempts — wait a moment and try again.',
};

function friendlyAuthError(error, fallback) {
  return AUTH_ERROR_MESSAGES[error.name] ?? fallback;
}

export default function SignUp({
  checkInviteKeyFn = checkInviteKey,
  signUpFn = signUp,
  confirmSignUpFn = confirmSignUp,
  signInFn = signIn,
  onConfirmed = () => {},
  onShowLogIn = () => {},
}) {
  const [inviteKeyCode, setInviteKeyCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // React batches setBusy(true) — a rapid double-click/Enter can re-enter this handler
  // before the disabled button re-renders. A ref is checked synchronously to close that gap.
  const submittingRef = useRef(false);

  async function handleSignUp(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    const code = inviteKeyCode.trim();

    try {
      let status;
      try {
        status = await checkInviteKeyFn(code);
      } catch {
        setError('Could not check your invite key right now. Please try again.');
        return;
      }

      if (status !== 'unredeemed') {
        setError(KEY_ERRORS[status] ?? KEY_ERRORS.invalid);
        return;
      }

      const result = await signUpFn({
        username: email,
        password,
        options: {
          userAttributes: { email },
          clientMetadata: { inviteKeyCode: code },
        },
      });
      setNeedsConfirmation(result.nextStep.signUpStep === 'CONFIRM_SIGN_UP');
    } catch (signUpError) {
      setError(friendlyAuthError(signUpError, 'Account creation failed. Please try again.'));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function handleConfirmation(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError('');

    try {
      // Cognito forwards clientMetadata per API call: metadata on signUp() reaches the
      // PreSignUp trigger only. The PostConfirmation trigger fires from THIS call, so the
      // invite key must ride along here or the trigger sees no key and deletes the user.
      const result = await confirmSignUpFn({
        username: email,
        confirmationCode,
        options: { clientMetadata: { inviteKeyCode: inviteKeyCode.trim() } },
      });
      if (result.isSignUpComplete) {
        // Sign in with the credentials still in hand rather than Cognito's auto-sign-in
        // session mechanism — the latter needs the USER_AUTH flow, which Amplify Gen 2's
        // default app client doesn't enable (confirmed live: InitiateAuth returned 400).
        try {
          await signInFn({ username: email, password });
        } catch {
          // Confirmation genuinely succeeded server-side, but we have no real session —
          // do NOT call onConfirmed() here, that would fake an authenticated state. The
          // usual cause: the post-confirmation trigger deleted this user after losing a
          // concurrent redemption race on the invite key.
          setError(
            "Your account was confirmed, but we couldn't sign you in automatically — this can happen if your invite key was claimed by someone else in the same moment. Please sign up again with a different key.",
          );
          return;
        }
        onConfirmed();
      }
    } catch (confirmationError) {
      setError(friendlyAuthError(confirmationError, 'Confirmation failed. Please try again.'));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  function handleBackToSignUp() {
    setNeedsConfirmation(false);
    setConfirmationCode('');
    setError('');
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl sm:p-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-300">Invitation only</p>
        <h1 className="mb-2 text-3xl font-bold">Create your account</h1>
        <p className="mb-8 text-sm text-gray-300">Redeem your Invite Key to begin using Systems Thinking Tarot.</p>

        <form className="space-y-5" onSubmit={needsConfirmation ? handleConfirmation : handleSignUp}>
          {!needsConfirmation ? (
            <>
              <Field label="Invite Key" value={inviteKeyCode} onChange={setInviteKeyCode} autoComplete="off" />
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
            </>
          ) : (
            <Field
              label="Confirmation code"
              value={confirmationCode}
              onChange={setConfirmationCode}
              autoComplete="one-time-code"
            />
          )}

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Please wait…' : needsConfirmation ? 'Confirm account' : 'Create account'}
          </button>

          {needsConfirmation && (
            <button
              type="button"
              onClick={handleBackToSignUp}
              disabled={busy}
              className="w-full text-center text-sm text-gray-400 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
            >
              Back — I need to fix my email
            </button>
          )}
          {!needsConfirmation && (
            <button
              type="button"
              onClick={onShowLogIn}
              disabled={busy}
              className="w-full text-center text-sm text-gray-400 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
            >
              Already have an account? Log in
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
