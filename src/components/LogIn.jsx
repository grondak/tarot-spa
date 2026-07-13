import { useRef, useState } from 'react';
import { signIn } from 'aws-amplify/auth';
import Field from './Field';

const AUTH_ERROR_MESSAGES = {
  NotAuthorizedException: 'Incorrect email or password.',
  UserNotFoundException: 'Incorrect email or password.',
  LimitExceededException: 'Too many attempts — wait a moment and try again.',
  TooManyRequestsException: 'Too many attempts — wait a moment and try again.',
};

const UNFINISHED_ACCOUNT_MESSAGE = "That account was never finished being set up, so it can't be logged into. Ask the person who gave you your invite key — or Tony — for help.";
const FALLBACK_MESSAGE = "Couldn't sign in. Please try again.";

export default function LogIn({
  signInFn = signIn,
  onSignedIn = () => {},
  onShowSignUp = () => {},
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError('');

    try {
      const result = await signInFn({ username: email.trim(), password });
      if (result.isSignedIn) {
        onSignedIn();
      } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        setError(UNFINISHED_ACCOUNT_MESSAGE);
      } else {
        setError(FALLBACK_MESSAGE);
      }
    } catch (signInError) {
      const errorName = signInError?.name;
      if (errorName === 'UserAlreadyAuthenticatedException') {
        onSignedIn();
      } else {
        setError(AUTH_ERROR_MESSAGES[errorName] ?? FALLBACK_MESSAGE);
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl sm:p-8">
        <h1 className="mb-2 text-3xl font-bold">Log in</h1>
        <p className="mb-8 text-sm text-gray-300">Welcome back to Systems Thinking Tarot.</p>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Please wait…' : 'Log in'}
          </button>

          <button
            type="button"
            onClick={onShowSignUp}
            disabled={busy}
            className="w-full text-center text-sm text-gray-400 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
          >
            Have an invite key? Create your account
          </button>
        </form>
      </section>
    </main>
  );
}
