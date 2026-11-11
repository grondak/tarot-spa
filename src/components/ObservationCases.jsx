import { useState } from 'react';
import { cycleSummary, formatSpan } from '../utils/observation/cases';
import { RIVAL_MIN_EVIDENCE } from '../utils/observation/relevance';
import { formatTime } from '../utils/observation/timeline';

const buttonClass = 'rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-sm text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40';
const fieldClass = 'w-full rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1.5 text-sm text-white placeholder:italic placeholder-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

const TITLE_LIMIT = 200;
const HYPOTHESIS_LIMIT = 2000;

function CycleLine({ events, status, id }) {
  const mine = events.filter((e) => e.caseId === id);
  const { opened, handedOff, closed, toOrient, toDecide } = cycleSummary(mine, status);
  if (opened === null) return null;
  return (
    <p className="text-xs text-gray-400">
      Opened {formatTime(opened)}
      {handedOff !== null && <> · handed to Orient {formatTime(handedOff)}{toOrient !== null && ` (${formatSpan(toOrient)} to orient)`}</>}
      {closed !== null && <> · closed {formatTime(closed)}{toDecide !== null && ` (${formatSpan(toDecide)} to decide)`}</>}
    </p>
  );
}

function OpenForm({ cases, hasOpen }) {
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const made = await cases.open({ title: title.trim(), hypothesis: hypothesis.trim() });
    setBusy(false);
    if (made) {
      setTitle('');
      setHypothesis('');
    }
  };
  const form = (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-sm text-gray-300">
        The decision I’m weighing
        <input
          className={`mt-1 ${fieldClass}`}
          value={title}
          maxLength={TITLE_LIMIT}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Plant a u-pick strawberry patch?"
        />
      </label>
      <label className="block text-sm text-gray-300">
        My hypothesis, in my own words
        <textarea
          className={`mt-1 min-h-16 resize-y ${fieldClass}`}
          value={hypothesis}
          maxLength={HYPOTHESIS_LIMIT}
          onChange={(e) => setHypothesis(e.target.value)}
          placeholder="What do you think is going on? Nothing is filled in for you."
        />
      </label>
      <button type="submit" className={buttonClass} disabled={!title.trim() || busy}>Open case</button>
    </form>
  );
  if (!hasOpen) return form;
  return (
    <details className="text-sm text-gray-300">
      <summary className="cursor-pointer">Open another case</summary>
      <div className="mt-2">{form}</div>
    </details>
  );
}

const RIVAL_MESSAGES = [
  ['RIVAL_DAILY_LIMIT', 'You’ve used today’s rival suggestions. Try again tomorrow.'],
  ['RIVAL_BUDGET_EXHAUSTED', 'Rival suggestions are paused until next month.'],
  ['RIVAL_UNAVAILABLE', 'No rival that fits your items came back this time. It wasn’t counted against your limit.'],
];

const rivalMessage = (error) => (
  RIVAL_MESSAGES.find(([code]) => error?.message?.includes(code))?.[1]
  ?? 'A rival couldn’t be suggested right now. Try again later.'
);

// A rival explanation on request. The suggestion lives only in this panel until the user keeps it.
function RivalSection({ cases, item, evidence }) {
  const [state, setState] = useState({ phase: 'idle' });
  const hasHypothesis = item.hypothesis.trim().length > 0;
  const enough = evidence.length >= RIVAL_MIN_EVIDENCE;
  const ask = async () => {
    setState({ phase: 'loading' });
    try {
      const result = await cases.suggestRival({ title: item.title, hypothesis: item.hypothesis, items: evidence });
      setState({ phase: 'offered', ...result });
    } catch (error) {
      setState({ phase: 'error', message: rivalMessage(error) });
    }
  };
  const keep = async () => {
    const saved = await cases.saveText(item.id, { title: item.title, hypothesis: item.hypothesis, rivalHypothesis: state.rival });
    if (saved) setState({ phase: 'idle' });
  };
  const titles = state.phase === 'offered'
    ? evidence.filter((e) => state.fits.includes(e.id)).map((e) => e.title)
    : [];
  return (
    <div className="space-y-2 border-t border-gray-800 pt-2">
      {item.rivalHypothesis && (
        <div>
          <p className="text-sm text-gray-300">A rival explanation I’m keeping</p>
          <p className="text-sm text-white" data-testid="kept-rival">{item.rivalHypothesis}</p>
          <button
            type="button"
            className="text-xs text-gray-400 underline"
            onClick={() => cases.saveText(item.id, { title: item.title, hypothesis: item.hypothesis, rivalHypothesis: '' })}
          >
            Remove the rival
          </button>
        </div>
      )}
      {state.phase === 'offered' && (
        <div className="space-y-1 rounded-md border border-gray-800 p-2" data-testid="rival-offer">
          <p className="text-sm text-gray-300">A rival that fits the same items. It is a question to test, not a verdict.</p>
          <p className="text-sm text-white">{state.rival}</p>
          {titles.length > 0 && (
            <p className="text-xs text-gray-400">Fits: {titles.join(' · ')}</p>
          )}
          <div className="flex gap-2">
            <button type="button" className={buttonClass} onClick={keep}>Keep as my second hypothesis</button>
            <button type="button" className={buttonClass} onClick={() => setState({ phase: 'idle' })}>Dismiss</button>
          </div>
        </div>
      )}
      {state.phase === 'error' && <p role="alert" className="text-sm text-red-400">{state.message}</p>}
      {state.phase !== 'offered' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={!hasHypothesis || !enough || state.phase === 'loading'}
            onClick={ask}
          >
            {state.phase === 'loading' ? 'Looking for a rival…' : 'Suggest a rival explanation'}
          </button>
          {!hasHypothesis && <span className="text-xs text-gray-400">Write and save your hypothesis first.</span>}
          {hasHypothesis && !enough && (
            <span className="text-xs text-gray-400">Needs at least {RIVAL_MIN_EVIDENCE} items that you’ve sorted or that look relevant.</span>
          )}
        </div>
      )}
      <p className="text-xs text-gray-400">
        Sends your case title, hypothesis and up to 12 of those items to the model for this one answer. Nothing is kept unless you keep it.
      </p>
    </div>
  );
}

function ActiveCase({ cases, item, tally, tallyAt, evidence }) {
  const [hypothesis, setHypothesis] = useState(item.hypothesis);
  const [confirming, setConfirming] = useState(false);
  const dirty = hypothesis !== item.hypothesis;
  return (
    <div className="space-y-2">
      <p className="font-semibold text-white">{item.title}</p>
      <label className="block text-sm text-gray-300">
        My hypothesis
        <textarea
          className={`mt-1 min-h-16 resize-y ${fieldClass}`}
          value={hypothesis}
          maxLength={HYPOTHESIS_LIMIT}
          onChange={(e) => setHypothesis(e.target.value)}
          placeholder="Write your hunch in your own words."
        />
      </label>
      <CycleLine events={cases.events} status={item.status} id={item.id} />
      {tally && (
        <p className="text-xs text-gray-400" data-testid="tally">
          Evidence up to {tallyAt}: <strong className="text-gray-200">{tally.supports}</strong> support
          {' · '}<strong className="text-gray-200">{tally.against}</strong> cut against
          {tally.unsorted > 0 && <> · {tally.unsorted} that look relevant, not sorted yet</>}.
          {' '}Counts only; the Window doesn’t say whether your hypothesis is true.
        </p>
      )}
      <RivalSection cases={cases} item={item} evidence={evidence} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={!dirty}
          onClick={() => cases.saveText(item.id, { title: item.title, hypothesis: hypothesis.trim() })}
        >
          Save hypothesis
        </button>
        <button type="button" className={buttonClass} onClick={() => cases.close(item.id)}>Close case</button>
        {confirming ? (
          <>
            <button type="button" className={`${buttonClass} !border-red-400 !text-red-300`} onClick={() => cases.remove(item.id)}>
              Yes, delete this case
            </button>
            <button type="button" className={buttonClass} onClick={() => setConfirming(false)}>Keep it</button>
          </>
        ) : (
          <button type="button" className={buttonClass} onClick={() => setConfirming(true)}>Delete case</button>
        )}
      </div>
    </div>
  );
}

export default function ObservationCases({ cases, tally = null, tallyAt = 'now', evidence = [] }) {
  const [confirmAll, setConfirmAll] = useState(false);
  const { status, openCases, closedCases, activeCase } = cases;
  const total = openCases.length + closedCases.length;
  return (
    <section aria-labelledby="cases-heading" className="my-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3">
      <h2 id="cases-heading" className="text-sm font-semibold text-gray-300">Your cases</h2>
      {status === 'loading' && <p role="status" className="mt-1 text-sm text-gray-400">Loading your cases…</p>}
      {status === 'error' && (
        <p role="alert" className="mt-1 text-sm text-red-400">
          Your cases couldn’t load.{' '}
          <button type="button" className="underline" onClick={cases.reload}>Try again</button>
        </p>
      )}
      {cases.failed && <p role="alert" className="mt-1 text-sm text-red-400">That didn’t save. Nothing was changed; try again.</p>}
      {status === 'ready' && (
        <div className="mt-2 space-y-3">
          {openCases.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              Working on
              <select className={buttonClass} value={activeCase?.id} onChange={(e) => cases.select(e.target.value)}>
                {openCases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          )}
          {activeCase && <ActiveCase key={activeCase.id} cases={cases} item={activeCase} tally={tally} tallyAt={tallyAt} evidence={evidence} />}
          <OpenForm cases={cases} hasOpen={Boolean(activeCase)} />
          {closedCases.length > 0 && (
            <details className="text-sm text-gray-300">
              <summary className="cursor-pointer">{closedCases.length} closed {closedCases.length === 1 ? 'case' : 'cases'}</summary>
              <ul className="mt-2 space-y-2">
                {closedCases.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <span className="block text-gray-200">{c.title}</span>
                      <CycleLine events={cases.events} status={c.status} id={c.id} />
                    </span>
                    <span className="flex gap-2">
                      <button type="button" className={buttonClass} onClick={() => cases.reopen(c.id)}>Reopen</button>
                      <button type="button" className={buttonClass} aria-label={`Delete “${c.title}”`} onClick={() => cases.remove(c.id)}>Delete</button>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {total > 0 && (
            <div className="text-xs text-gray-400">
              Your cases are kept until you delete them.{' '}
              {confirmAll ? (
                <>
                  <button type="button" className="underline" onClick={() => { cases.removeAll(); setConfirmAll(false); }}>
                    Yes, delete every case I wrote
                  </button>{' '}
                  <button type="button" className="underline" onClick={() => setConfirmAll(false)}>Keep them</button>
                </>
              ) : (
                <button type="button" className="underline" onClick={() => setConfirmAll(true)}>Delete all my cases</button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
