import { useEffect, useState } from 'react';
import { getMyAccount } from '../utils/account';
import { deleteAllCases } from '../utils/observation/cases';
import { clearObservationPreferences } from '../utils/observation/preferences';

const buttonClass = 'rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

const GENERATION_LABELS = {
  FirstGen: 'First generation',
  SecondGen: 'Second generation',
};

export default function AccountScreen({
  getMyAccountFn = getMyAccount,
  clearPreferencesFn = clearObservationPreferences,
  deleteAllCasesFn = deleteAllCases,
  onBack = () => {},
}) {
  const [loadStatus, setLoadStatus] = useState('loading');
  const [account, setAccount] = useState(null);
  const [requestId, setRequestId] = useState(0);
  const [forgetStatus, setForgetStatus] = useState(null);
  const [casesStatus, setCasesStatus] = useState(null);

  useEffect(() => {
    let active = true;

    getMyAccountFn()
      .then((result) => {
        if (!active) return;
        setAccount(result);
        setLoadStatus(result ? 'ready' : 'missing');
      })
      .catch(() => {
        if (active) setLoadStatus('error');
      });

    return () => {
      active = false;
    };
  }, [getMyAccountFn, requestId]);

  if (loadStatus === 'loading') {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold">Your Account</h1>
          <p role="status" className="mt-4 text-sm text-gray-400">Loading account…</p>
          <button type="button" onClick={onBack} className={`mt-8 ${buttonClass}`}>
            Back
          </button>
        </div>
      </main>
    );
  }

  if (loadStatus === 'missing' || loadStatus === 'error') {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3">
          <h1 className="w-full text-2xl font-bold">Your Account</h1>
          <span role="alert" className="text-sm text-red-400">
            {loadStatus === 'missing' ? 'Account record unavailable' : 'Account couldn’t load'}
          </span>
          <button
            type="button"
            onClick={() => {
              setLoadStatus('loading');
              setRequestId((value) => value + 1);
            }}
            className={buttonClass}
          >
            Retry
          </button>
          <button type="button" onClick={onBack} className={buttonClass}>
            Back
          </button>
        </div>
      </main>
    );
  }

  const inviteKeyStatus = account.generation === 'FirstGen'
    ? 'Your account can mint a key to invite others.'
    : 'At this time, second generation accounts may not mint keys to invite others. We’re testing who’s sharing the app. Thanks for your understanding.';

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-2xl font-bold">Your Account</h1>
        <dl className="mt-8 divide-y divide-gray-800 border-y border-gray-800">
          <div className="py-4">
            <dt className="text-sm font-semibold text-gray-300">Generation</dt>
            <dd className="mt-1 text-gray-400">
              {GENERATION_LABELS[account.generation] ?? account.generation}
            </dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-gray-300">Onward Invite Key</dt>
            <dd className="mt-1 text-gray-400">{inviteKeyStatus}</dd>
          </div>
        </dl>
        <section className="mt-8" aria-labelledby="observe-data-heading">
          <h2 id="observe-data-heading" className="text-sm font-semibold text-gray-300">Observation Window data</h2>
          <p className="mt-1 text-gray-400">
            Nothing about what you look at in the Observation Window is stored on our servers,
            except your cases: the decisions and hypotheses you wrote, the times you opened,
            handed off and closed them, which items you tagged and any stakes you set, plus a rival explanation if you chose to keep one. Only you can see them, and they stay until you delete them.
            Asking for a rival explanation sends your case words and a few items to an AI model once; the answer isn’t kept unless you keep it.
            This browser also remembers which groups you closed and which sources you switched off
            or dismissed. Clear that here, or from the Window itself.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {casesStatus === 'confirming' ? (
              <>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    setCasesStatus('deleting');
                    deleteAllCasesFn().then(() => setCasesStatus('deleted')).catch(() => setCasesStatus('failed'));
                  }}
                >
                  Yes, delete every case I wrote
                </button>
                <button type="button" className={buttonClass} onClick={() => setCasesStatus(null)}>Keep them</button>
              </>
            ) : (
              <button
                type="button"
                className={buttonClass}
                disabled={casesStatus === 'deleting'}
                onClick={() => setCasesStatus('confirming')}
              >
                Delete all my cases
              </button>
            )}
            {casesStatus === 'deleted' && (
              <span role="status" className="text-sm text-gray-400">Deleted. Every case, its times and its tags are gone.</span>
            )}
            {casesStatus === 'failed' && (
              <span role="alert" className="text-sm text-red-400">Some cases couldn’t be deleted. Try again.</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={buttonClass}
              onClick={() => setForgetStatus(clearPreferencesFn() ? 'cleared' : 'failed')}
            >
              Clear what this browser remembers
            </button>
            {forgetStatus === 'cleared' && (
              <span role="status" className="text-sm text-gray-400">Cleared.</span>
            )}
            {forgetStatus === 'failed' && (
              <span role="alert" className="text-sm text-red-400">This browser wouldn’t let us clear it.</span>
            )}
          </div>
        </section>
        <button type="button" onClick={onBack} className={`mt-8 ${buttonClass}`}>
          Back
        </button>
      </div>
    </main>
  );
}
