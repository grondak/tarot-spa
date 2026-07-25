import { useCallback, useEffect, useRef, useState } from 'react';
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
  getSession,
  getOrientationStatus,
  isCompleteGuideSession,
  startOrientationGuide,
} from './utils/orientation';

const ORIENTATION_POLL_MS = 5000;
const ORIENTATION_DEADLINE_MS = 300000;
const ORIENTATION_MISSING_GRACE_MS = 15000;
const ACTIVE_ORIENTATION_SESSION_KEY = 'tarotSpaActiveOrientationSession';
const ORIENTATION_REDRAW_CONTEXT_KEY = 'tarotSpaOrientationRedrawContext';
const ORIENTATION_STATUS_UNKNOWN = 'GENERATION_STATUS_UNKNOWN';

function getActiveOrientationSession() {
  try {
    return localStorage.getItem(ACTIVE_ORIENTATION_SESSION_KEY);
  } catch {
    return null;
  }
}

function storeActiveOrientationSession(sessionId) {
  try {
    localStorage.setItem(ACTIVE_ORIENTATION_SESSION_KEY, sessionId);
    return true;
  } catch {
    return false;
  }
}

function clearActiveOrientationSession(sessionId) {
  try {
    if (
      !sessionId
      || localStorage.getItem(ACTIVE_ORIENTATION_SESSION_KEY) === sessionId
    ) {
      localStorage.removeItem(ACTIVE_ORIENTATION_SESSION_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

function getOrientationRedrawContext() {
  try {
    return localStorage.getItem(ORIENTATION_REDRAW_CONTEXT_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeOrientationRedrawContext(context) {
  try {
    localStorage.setItem(ORIENTATION_REDRAW_CONTEXT_KEY, context);
    return true;
  } catch {
    return false;
  }
}

function clearOrientationRedrawContext() {
  try {
    localStorage.removeItem(ORIENTATION_REDRAW_CONTEXT_KEY);
  } catch {
    // Best-effort removal: a surviving stale draft is cleared again at the
    // next submit start, recovery restore, or auth loss.
  }
}

export default function App() {
  const [authState, setAuthState] = useState('loading');
  const [authScreen, setAuthScreen] = useState('landing');
  const [spreadKey, setSpreadKey] = useState(null);
  const [cards, setCards] = useState([]);
  const [rateLimited, setRateLimited] = useState(false);
  const [guideResult, setGuideResult] = useState(null);
  const [orientBusy, setOrientBusy] = useState(false);
  const [orientError, setOrientError] = useState(null);
  const [orientContext, setOrientContext] = useState(getOrientationRedrawContext);
  const [orientSpreadKey, setOrientSpreadKey] = useState(null);
  const [orientRecoveryRevision, setOrientRecoveryRevision] = useState(0);
  const authRequestId = useRef(0);
  const authStateRef = useRef('loading');
  const orientationFlowId = useRef(0);
  const orientationDelays = useRef(new Set());
  const orientationSubmitting = useRef(false);

  const createOrientationDelay = useCallback((duration) => {
    let settled = false;
    let resolvePromise;
    let timerId;
    const entry = {
      cancel: () => settle('cancelled'),
    };

    function settle(outcome) {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      orientationDelays.current.delete(entry);
      resolvePromise(outcome);
    }

    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
      timerId = setTimeout(() => settle('elapsed'), Math.max(0, duration));
    });
    orientationDelays.current.add(entry);
    return { promise, cancel: entry.cancel };
  }, []);

  const cancelOrientationDelays = useCallback(() => {
    for (const entry of [...orientationDelays.current]) entry.cancel();
  }, []);

  const runUntilDeadline = useCallback(async (operation, deadline) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { kind: 'timeout' };

    const delay = createOrientationDelay(remaining);
    try {
      return await Promise.race([
        Promise.resolve(operation).then(
          (value) => ({ kind: 'value', value }),
          (error) => ({ kind: 'error', error }),
        ),
        delay.promise.then((outcome) => ({
          kind: outcome === 'elapsed' ? 'timeout' : 'cancelled',
        })),
      ]);
    } finally {
      delay.cancel();
    }
  }, [createOrientationDelay]);

  const waitForOrientationPoll = useCallback(async (deadline) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return 'elapsed';
    const delay = createOrientationDelay(Math.min(ORIENTATION_POLL_MS, remaining));
    return delay.promise;
  }, [createOrientationDelay]);

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
          clearOrientationRedrawContext();
          setOrientContext('');
          if (sessionWasAuthenticated) {
            orientationFlowId.current += 1;
            cancelOrientationDelays();
            clearActiveOrientationSession();
            orientationSubmitting.current = false;
            setAuthScreen('landing');
            setSpreadKey(null);
            setCards([]);
            setOrientBusy(false);
            setOrientError(null);
            setOrientSpreadKey(null);
            setGuideResult(null);
          }
        }
      }
    }

    refreshAuth();
    return Hub.listen('auth', refreshAuth);
  }, [cancelOrientationDelays]);

  useEffect(() => () => {
    orientationFlowId.current += 1;
    cancelOrientationDelays();
  }, [cancelOrientationDelays]);

  useEffect(() => {
    let active = true;
    const flowId = orientationFlowId.current;
    if (authState !== 'authenticated') {
      return () => {
        active = false;
      };
    }

    getOrientationStatus()
      .then((status) => {
        if (active && orientationFlowId.current === flowId) {
          setRateLimited(status?.limitExhausted === true);
        }
      })
      .catch(() => {
        if (active && orientationFlowId.current === flowId) setRateLimited(false);
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

  const showGuideResult = useCallback((result, flowId) => {
    setGuideResult(result);
    getOrientationStatus()
      .then((status) => {
        if (
          authStateRef.current === 'authenticated'
          && orientationFlowId.current === flowId
        ) {
          setRateLimited(status?.limitExhausted === true);
        }
      })
      .catch(() => {});
  }, []);

  const restoreOrientationInput = useCallback((session) => {
    if (typeof session?.context === 'string') {
      // The recovered Context is fresher than any persisted redraw draft;
      // drop the draft so a later reload cannot overwrite the recovery.
      clearOrientationRedrawContext();
      setOrientContext(session.context);
    }
    if (
      typeof session?.spreadKey === 'string'
      && Object.hasOwn(SPREADS, session.spreadKey)
    ) {
      setOrientSpreadKey(session.spreadKey);
    }
    setOrientRecoveryRevision((revision) => revision + 1);
  }, []);

  const followSession = useCallback(async (
    sessionId,
    flowId,
    firstSession,
    missingIsError,
    deadline,
    restoreContextOnFailure,
  ) => {
    let session = firstSession;
    let missingSince = null;

    function finishWithError(errorCode, { clearSession = true } = {}) {
      if (clearSession) clearActiveOrientationSession(sessionId);
      setOrientError(errorCode);
      setOrientBusy(false);
      orientationSubmitting.current = false;
    }

    while (orientationFlowId.current === flowId) {
      if (Date.now() >= deadline) {
        finishWithError(ORIENTATION_STATUS_UNKNOWN, { clearSession: false });
        return;
      }

      if (session === undefined) {
        const read = await runUntilDeadline(getSession(sessionId), deadline);
        if (orientationFlowId.current !== flowId || read.kind === 'cancelled') return;
        if (read.kind === 'timeout') {
          finishWithError(ORIENTATION_STATUS_UNKNOWN, { clearSession: false });
          return;
        }
        if (read.kind === 'error' || read.value === undefined) {
          if (read.error?.message?.includes('MALFORMED_SESSION')) {
            if (restoreContextOnFailure) restoreOrientationInput(read.error?.session);
            finishWithError('GENERATION_FAILED');
            return;
          }
          const waitOutcome = await waitForOrientationPoll(deadline);
          if (orientationFlowId.current !== flowId || waitOutcome === 'cancelled') return;
          continue;
        }
        session = read.value;
      }
      if (orientationFlowId.current !== flowId) return;

      if (session === null) {
        if (missingIsError) {
          missingSince ??= Date.now();
          if (Date.now() - missingSince < ORIENTATION_MISSING_GRACE_MS) {
            const waitOutcome = await waitForOrientationPoll(deadline);
            if (orientationFlowId.current !== flowId || waitOutcome === 'cancelled') return;
            session = undefined;
            continue;
          }
          finishWithError('GENERATION_FAILED');
          return;
        }
        clearActiveOrientationSession(sessionId);
        setOrientBusy(false);
        orientationSubmitting.current = false;
        return;
      }
      missingSince = null;

      if (session?.id !== sessionId) {
        if (restoreContextOnFailure) restoreOrientationInput(session);
        finishWithError('GENERATION_FAILED');
        return;
      }

      const status = session?.status ?? 'SUCCEEDED';
      if (status === 'SUCCEEDED') {
        if (!isCompleteGuideSession(session, sessionId)) {
          if (restoreContextOnFailure) restoreOrientationInput(session);
          finishWithError('GENERATION_FAILED');
          return;
        }
        showGuideResult({
          spreadKey: session.spreadKey,
          context: session.context,
          sessionId: session.id,
          cards: session.cards,
          currentEvents: session.currentEvents,
          guide: session.guide,
          tavilyTimedOut: session.tavilyTimedOut,
        }, flowId);
        setOrientBusy(false);
        orientationSubmitting.current = false;
        return;
      }

      if (status === 'FAILED') {
        clearActiveOrientationSession(sessionId);
        if (restoreContextOnFailure) restoreOrientationInput(session);
        const errorCode = typeof session.errorCode === 'string' && session.errorCode.trim()
          ? session.errorCode.trim()
          : 'GENERATION_FAILED';
        if (errorCode.includes('DAILY_LIMIT_EXHAUSTED')) {
          setRateLimited(true);
        } else {
          setOrientError(errorCode);
        }
        setOrientBusy(false);
        orientationSubmitting.current = false;
        return;
      }

      if (status !== 'PENDING' && status !== 'RUNNING') {
        clearActiveOrientationSession(sessionId);
        if (restoreContextOnFailure) restoreOrientationInput(session);
        finishWithError('GENERATION_FAILED', { clearSession: false });
        return;
      }

      const waitOutcome = await waitForOrientationPoll(deadline);
      if (orientationFlowId.current !== flowId || waitOutcome === 'cancelled') return;
      session = undefined;
    }
  }, [restoreOrientationInput, runUntilDeadline, showGuideResult, waitForOrientationPoll]);

  const resumeActiveOrientationSession = useCallback((sessionId) => {
    if (!sessionId || orientationSubmitting.current) return null;
    cancelOrientationDelays();
    orientationSubmitting.current = true;
    const flowId = ++orientationFlowId.current;
    const deadline = Date.now() + ORIENTATION_DEADLINE_MS;
    setOrientError(null);
    setOrientBusy(true);
    void followSession(sessionId, flowId, undefined, false, deadline, true)
      .catch(() => {
        if (orientationFlowId.current !== flowId) return;
        clearActiveOrientationSession(sessionId);
        setOrientError('GENERATION_FAILED');
        setOrientBusy(false);
        orientationSubmitting.current = false;
      });
    return flowId;
  }, [cancelOrientationDelays, followSession]);

  useEffect(() => {
    if (authState !== 'authenticated') return undefined;
    const sessionId = getActiveOrientationSession();
    if (!sessionId) return undefined;
    const flowId = resumeActiveOrientationSession(sessionId);

    return () => {
      if (flowId !== null && orientationFlowId.current === flowId) {
        orientationFlowId.current += 1;
        cancelOrientationDelays();
      }
    };
  }, [authState, cancelOrientationDelays, resumeActiveOrientationSession]);

  async function handleOrient(context, selectedSpreadKey) {
    if (orientationSubmitting.current || getActiveOrientationSession()) return;
    clearOrientationRedrawContext();
    orientationSubmitting.current = true;
    cancelOrientationDelays();
    const flowId = ++orientationFlowId.current;
    const deadline = Date.now() + ORIENTATION_DEADLINE_MS;
    let requestId;

    function failGeneration() {
      if (orientationFlowId.current !== flowId) return;
      if (requestId) clearActiveOrientationSession(requestId);
      setOrientError('GENERATION_FAILED');
      setOrientBusy(false);
      orientationSubmitting.current = false;
    }

    function markGenerationStatusUnknown() {
      if (orientationFlowId.current !== flowId) return;
      setOrientError(ORIENTATION_STATUS_UNKNOWN);
      setOrientBusy(false);
      orientationSubmitting.current = false;
    }

    setOrientError(null);
    setOrientBusy(true);
    try {
      requestId = crypto.randomUUID();
      if (!storeActiveOrientationSession(requestId)) throw new Error('storage unavailable');
    } catch {
      failGeneration();
      return;
    }

    const start = await runUntilDeadline(
      startOrientationGuide(requestId, context, selectedSpreadKey),
      deadline,
    );
    if (orientationFlowId.current !== flowId || start.kind === 'cancelled') return;

    if (start.kind === 'timeout') {
      markGenerationStatusUnknown();
      return;
    }

    if (start.kind !== 'value') {
      const message = start.kind === 'error' ? start.error?.message || '' : '';
      if (message.includes('IDEMPOTENCY_CONFLICT')) {
        failGeneration();
        return;
      }

      let existingSession;
      const missingDeadline = Math.min(
        deadline,
        Date.now() + ORIENTATION_MISSING_GRACE_MS,
      );
      while (orientationFlowId.current === flowId) {
        const read = await runUntilDeadline(getSession(requestId), deadline);
        if (orientationFlowId.current !== flowId || read.kind === 'cancelled') return;
        if (read.kind === 'timeout') {
          markGenerationStatusUnknown();
          return;
        }
        if (read.kind === 'error' || read.value === undefined) {
          if (read.error?.message?.includes('MALFORMED_SESSION')) {
            failGeneration();
            return;
          }
          const waitOutcome = await waitForOrientationPoll(deadline);
          if (orientationFlowId.current !== flowId || waitOutcome === 'cancelled') return;
          continue;
        }
        if (read.value === null && Date.now() < missingDeadline) {
          const waitOutcome = await waitForOrientationPoll(deadline);
          if (orientationFlowId.current !== flowId || waitOutcome === 'cancelled') return;
          continue;
        }
        existingSession = read.value;
        break;
      }

      if (!existingSession) {
        failGeneration();
        return;
      }
      if (existingSession.status === 'PENDING') {
        const retry = await runUntilDeadline(
          startOrientationGuide(requestId, context, selectedSpreadKey),
          deadline,
        );
        if (orientationFlowId.current !== flowId || retry.kind === 'cancelled') return;
        if (retry.kind === 'error') {
          const retryMessage = retry.error?.message || '';
          if (retryMessage.includes('IDEMPOTENCY_CONFLICT')) {
            failGeneration();
            return;
          }
        }
      }

      try {
        await followSession(requestId, flowId, existingSession, true, deadline, false);
      } catch {
        failGeneration();
      }
      return;
    }

    try {
      await followSession(requestId, flowId, undefined, true, deadline, false);
    } catch {
      failGeneration();
    }
  }

  function handleResumeOrientation() {
    const sessionId = getActiveOrientationSession();
    if (sessionId) resumeActiveOrientationSession(sessionId);
  }

  function handleSignedOut() {
    authRequestId.current += 1;
    orientationFlowId.current += 1;
    cancelOrientationDelays();
    orientationSubmitting.current = false;
    authStateRef.current = 'unauthenticated';
    clearActiveOrientationSession();
    clearOrientationRedrawContext();
    setAuthState('unauthenticated');
    setAuthScreen('landing');
    setSpreadKey(null);
    setCards([]);
    setRateLimited(false);
    setOrientBusy(false);
    setOrientError(null);
    setOrientContext('');
    setOrientSpreadKey(null);
    setGuideResult(null);
  }

  function handleSignedIn() {
    authRequestId.current += 1;
    authStateRef.current = 'authenticated';
    setRateLimited(false);
    setAuthState('authenticated');
  }

  function handleRedraw(preserveContext) {
    const context = preserveContext ? (guideResult?.context ?? '') : '';
    orientationFlowId.current += 1;
    cancelOrientationDelays();
    clearActiveOrientationSession(guideResult?.sessionId);
    if (preserveContext) {
      if (!storeOrientationRedrawContext(context)) {
        // Store failed with the key possibly still holding an older draft;
        // best-effort clear so the persisted draft does not diverge from the
        // prefill (fully denied storage can still leave one behind).
        clearOrientationRedrawContext();
      }
    } else {
      clearOrientationRedrawContext();
    }
    orientationSubmitting.current = false;
    setOrientBusy(false);
    setOrientError(null);
    setOrientContext(context);
    setOrientSpreadKey(null);
    setGuideResult(null);
  }

  function handleRedrawFresh() {
    handleRedraw(false);
  }

  function handleRedrawTweak() {
    handleRedraw(true);
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
          onRedrawFresh={handleRedrawFresh}
          onRedrawTweak={handleRedrawTweak}
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
          key={`orientation-entry-${orientRecoveryRevision}`}
          rateLimited={rateLimited}
          initialContext={orientContext}
          initialSpreadKey={orientSpreadKey}
          orientBusy={orientBusy}
          orientError={orientError}
          onOrient={handleOrient}
          onResumeOrientation={handleResumeOrientation}
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
