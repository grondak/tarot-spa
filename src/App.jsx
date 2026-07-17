import { useEffect, useRef, useState } from 'react';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { SPREADS, shuffleAndDraw, encodeDraw, decodeDraw } from './utils/deck';
import SpreadSelector from './components/SpreadSelector';
import SpreadView from './components/SpreadView';
import SignUp from './components/SignUp';
import LogIn from './components/LogIn';
import GrantInviteKey from './components/GrantInviteKey';
import PublicLanding from './components/PublicLanding';
import { getMyAccount } from './utils/account';

export default function App() {
  const [authState, setAuthState] = useState('loading');
  const [authScreen, setAuthScreen] = useState('landing');
  const [spreadKey, setSpreadKey] = useState(null);
  const [cards, setCards] = useState([]);
  const authRequestId = useRef(0);

  useEffect(() => {
    async function refreshAuth() {
      const requestId = ++authRequestId.current;
      try {
        await getCurrentUser();
        if (requestId === authRequestId.current) setAuthState('authenticated');
      } catch {
        if (requestId === authRequestId.current) {
          setAuthState('unauthenticated');
          setAuthScreen('landing');
        }
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

  function handleSignedOut() {
    authRequestId.current += 1;
    setAuthState('unauthenticated');
    setAuthScreen('landing');
    setSpreadKey(null);
    setCards([]);
  }

  function handleSignedIn() {
    authRequestId.current += 1;
    setAuthState('authenticated');
  }

  if (authState === 'loading') {
    return <main className="min-h-screen bg-gray-950" aria-label="Loading account" />;
  }

  if (authState === 'unauthenticated') {
    if (authScreen === 'landing') {
      return (
        <PublicLanding
          onShowSignUp={() => setAuthScreen('signup')}
          onShowLogIn={() => setAuthScreen('login')}
        />
      );
    }

    return authScreen === 'login' ? (
      <LogIn
        onSignedIn={handleSignedIn}
        onShowSignUp={() => setAuthScreen('signup')}
      />
    ) : (
      <SignUp
        onConfirmed={handleSignedIn}
        onShowLogIn={() => setAuthScreen('login')}
      />
    );
  }

  return (
    <>
      <AccountBar onSignedOut={handleSignedOut} />
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

export function AccountBar({ signOutFn = signOut, onSignedOut = () => {} }) {
  const [account, setAccount] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [requestId, setRequestId] = useState(0);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

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

  async function handleLogOut() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);

    try {
      await signOutFn();
    } catch {
      // Sign-out must always leave the authenticated surface.
    } finally {
      onSignedOut();
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-gray-950 px-4 py-3 text-white">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-gray-400">Your account</span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
        {account && <GrantInviteKey account={account} refreshAccountFn={getMyAccount} />}
        {!account && loadStatus === 'loading' && <span role="status" className="text-sm text-gray-400">Loading account…</span>}
        {!account && loadStatus === 'missing' && (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
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
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
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
        <button
          type="button"
          onClick={handleLogOut}
          disabled={busy}
          className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? 'Logging out…' : 'Log Out'}
        </button>
      </div>
    </header>
  );
}
