import { useEffect, useState } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { SPREADS, shuffleAndDraw, encodeDraw, decodeDraw } from './utils/deck';
import SpreadSelector from './components/SpreadSelector';
import SpreadView from './components/SpreadView';
import SignUp from './components/SignUp';
import GrantInviteKey from './components/GrantInviteKey';
import { getMyAccount } from './utils/account';

export default function App() {
  const [authState, setAuthState] = useState('loading');
  const [spreadKey, setSpreadKey] = useState(null);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    async function refreshAuth() {
      try {
        await getCurrentUser();
        setAuthState('authenticated');
      } catch {
        setAuthState('unauthenticated');
      }
    }

    refreshAuth();
    return Hub.listen('auth', refreshAuth);
  }, []);

  function handleSelect(key) {
    const n = SPREADS[key].positions.length;
    setCards(shuffleAndDraw(n));
    setSpreadKey(key);
  }

  function handleDrawAgain() {
    const n = SPREADS[spreadKey].positions.length;
    setCards(shuffleAndDraw(n));
  }

  function handleBack() {
    setSpreadKey(null);
    setCards([]);
  }

  function handleLoadCode(code) {
    const result = decodeDraw(code);
    if (!result) return false;
    setCards(result.cards);
    setSpreadKey(result.spreadKey);
    return true;
  }

  if (authState === 'loading') {
    return <main className="min-h-screen bg-gray-950" aria-label="Loading account" />;
  }

  if (authState === 'unauthenticated') {
    return <SignUp onConfirmed={() => setAuthState('authenticated')} />;
  }

  return (
    <>
      <AccountBar />
      {spreadKey ? (
      <SpreadView
        spread={SPREADS[spreadKey]}
        cards={cards}
        drawCode={encodeDraw(spreadKey, cards)}
        onDrawAgain={handleDrawAgain}
        onBack={handleBack}
      />
      ) : (
        <SpreadSelector onSelect={handleSelect} onLoadCode={handleLoadCode} />
      )}
    </>
  );
}

export function AccountBar() {
  const [account, setAccount] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let active = true;
    getMyAccount()
      .then((result) => {
        if (active) {
          setAccount(result);
          setLoadStatus(result ? 'ready' : 'missing');
        }
      })
      .catch(() => {
        if (active) setLoadStatus('error');
      });

    return () => {
      active = false;
    };
  }, [requestId]);

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-gray-800 bg-gray-950 px-4 py-3 text-white">
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Your account</span>
      {account && <GrantInviteKey account={account} refreshAccountFn={getMyAccount} />}
      {!account && loadStatus === 'loading' && <span role="status" className="text-sm text-gray-400">Loading account…</span>}
      {!account && loadStatus === 'missing' && (
        <div className="flex items-center gap-3">
          <span role="status" className="text-sm text-gray-400">Account record unavailable</span>
          <button
            type="button"
            onClick={() => {
              setLoadStatus('loading');
              setRequestId((value) => value + 1);
            }}
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Retry account
          </button>
        </div>
      )}
      {!account && loadStatus === 'error' && (
        <div className="flex items-center gap-3">
          <span role="alert" className="text-sm text-red-400">Account couldn’t load</span>
          <button
            type="button"
            onClick={() => {
              setLoadStatus('loading');
              setRequestId((value) => value + 1);
            }}
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Retry account
          </button>
        </div>
      )}
    </header>
  );
}
