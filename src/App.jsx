import { useEffect, useRef, useState } from 'react';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { SPREADS, shuffleAndDraw, encodeDraw, decodeDraw } from './utils/deck';
import ContextEntry from './components/ContextEntry';
import SpreadView from './components/SpreadView';
import SignUp from './components/SignUp';
import LogIn from './components/LogIn';
import GrantInviteKey from './components/GrantInviteKey';
import PublicLanding from './components/PublicLanding';
import OrientationGuideResults from './components/OrientationGuideResults';
import { getMyAccount } from './utils/account';
import {
  generateOrientationGuide,
  getNewestSession,
  getOrientationStatus,
} from './utils/orientation';

const RECOVERY_POLL_MS = 5000;
const RECOVERY_DEADLINE_MS = 75000;

export default function App() {
  const [authState, setAuthState] = useState('loading');
  const [authScreen, setAuthScreen] = useState('landing');
  const [spreadKey, setSpreadKey] = useState(null);
  const [cards, setCards] = useState([]);
  const [rateLimited, setRateLimited] = useState(false);
  const [guideResult, setGuideResult] = useState(null);
  const authRequestId = useRef(0);
  const authStateRef = useRef('loading');

  useEffect(() => {
    async function refreshAuth() {
      const requestId = ++authRequestId.current;
      try {
        await getCurrentUser();
        if (requestId === authRequestId.current) {
          authStateRef.current = 'authenticated';
          setAuthState('authenticated');
        }
      } catch {
        if (requestId === authRequestId.current) {
          const sessionWasAuthenticated = authStateRef.current === 'authenticated';
          authStateRef.current = 'unauthenticated';
          setAuthState('unauthenticated');
          if (sessionWasAuthenticated) {
            setAuthScreen('landing');
            setSpreadKey(null);
            setCards([]);
            setGuideResult(null);
          }
        }
      }
    }

    refreshAuth();
    return Hub.listen('auth', refreshAuth);
  }, []);

  useEffect(() => {
    let active = true;
    if (authState !== 'authenticated') {
      return () => {
        active = false;
      };
    }

    getOrientationStatus()
      .then((status) => {
        if (active) setRateLimited(status?.limitExhausted === true);
      })
      .catch(() => {
        if (active) setRateLimited(false);
      });

    return () => {
      active = false;
    };
  }, [authState]);

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

  function showGuideResult(result) {
    setGuideResult(result);
    getOrientationStatus()
      .then((status) => setRateLimited(status?.limitExhausted === true))
      .catch(() => {});
  }

  async function handleOrient(context, selectedSpreadKey) {
    const submittedAt = Date.now();
    const baseline = await getNewestSession().catch(() => null);

    try {
      const result = await generateOrientationGuide(context, selectedSpreadKey);
      showGuideResult({ spreadKey: selectedSpreadKey, context, ...result });
      return;
    } catch (error) {
      const message = error?.message || '';
      if (message.includes('DAILY_LIMIT_EXHAUSTED')) {
        setRateLimited(true);
        return;
      }
      if (
        message.includes('MONTHLY_BUDGET_EXHAUSTED')
        || message.includes('GENERATION_FAILED')
      ) {
        throw error;
      }
    }

    const deadline = submittedAt + RECOVERY_DEADLINE_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, Math.min(RECOVERY_POLL_MS, deadline - Date.now()));
      });
      const session = await getNewestSession().catch(() => null);
      const isNew = session && (
        baseline === null
        || (session.id !== baseline.id && session.createdAt > baseline.createdAt)
      );
      if (isNew) {
        showGuideResult({
          spreadKey: session.spreadKey,
          context: session.context,
          sessionId: session.id,
          cards: session.cards,
          currentEvents: session.currentEvents,
          guide: session.guide,
          tavilyTimedOut: session.tavilyTimedOut,
        });
        return;
      }
    }

    throw new Error('GENERATION_FAILED');
  }

  function handleSignedOut() {
    authRequestId.current += 1;
    authStateRef.current = 'unauthenticated';
    setAuthState('unauthenticated');
    setAuthScreen('landing');
    setSpreadKey(null);
    setCards([]);
    setRateLimited(false);
    setGuideResult(null);
  }

  function handleSignedIn() {
    authRequestId.current += 1;
    authStateRef.current = 'authenticated';
    setRateLimited(false);
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
      {guideResult ? (
        <OrientationGuideResults
          result={guideResult}
          onBack={() => setGuideResult(null)}
        />
      ) : spreadKey ? (
      <SpreadView
        spread={SPREADS[spreadKey]}
        cards={cards}
        drawCode={encodeDraw(spreadKey, cards)}
        onDrawAgain={handleDrawAgain}
        onBack={handleBack}
      />
      ) : (
        <ContextEntry
          rateLimited={rateLimited}
          onOrient={handleOrient}
          onQuickDrawSelect={handleSelect}
          onLoadCode={handleLoadCode}
        />
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
