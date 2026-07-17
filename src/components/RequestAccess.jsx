import { useRef, useState } from 'react';
import { requestAccess } from '../utils/requestAccess';
import Field from './Field';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACKNOWLEDGMENT = 'Request received — Tony will follow up personally.';

export default function RequestAccess({ requestAccessFn = requestAccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // React batches setBusy(true) — a rapid double-click/Enter can re-enter this handler
  // before the disabled button re-renders. A ref is checked synchronously to close that gap.
  const submittingRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("That email address doesn't look right — double-check it.");
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    setError('');

    try {
      await requestAccessFn(trimmedName, trimmedEmail);
      setSubmitted(true);
    } catch {
      setError("Couldn't send your request right now. Please try again.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl border-t border-gray-800 py-12">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Want the Deeper Experience?</p>
        <h2 className="mt-2 text-2xl font-bold">Request Access</h2>
        <p className="mt-2 text-sm text-gray-400">Invite-only for now — leave your name and email and Tony will follow up personally.</p>
      </div>
      <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900 p-6">
        {submitted ? (
          <p>{ACKNOWLEDGMENT}</p>
        ) : (
          <form noValidate onSubmit={handleSubmit}>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[200px] flex-1">
                <Field label="Name" value={name} onChange={setName} autoComplete="name" />
              </div>
              <div className="min-w-[200px] flex-1">
                <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
              </div>
            </div>

            {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? 'Please wait…' : 'Request Access'}
            </button>
          </form>
        )}
        <span role="status" aria-live="polite" className="sr-only">
          {submitted ? ACKNOWLEDGMENT : ''}
        </span>
      </div>
    </section>
  );
}
