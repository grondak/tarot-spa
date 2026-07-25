import { useState } from 'react';
import OrnamentalDivider from './OrnamentalDivider';
import SpreadSelector from './SpreadSelector';

const CONTEXT_HINT = 'Tell me about your upcoming decision, and what you know or think you know about the situation.';
const GENERATION_ERROR = 'Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.';
const MONTHLY_ERROR = "Everyone's shared monthly Guide budget is spent — Orientation Guides return when the month rolls over. Quick Draw is always free.";
const STATUS_UNKNOWN = 'Your Guide is taking longer than expected. We kept this request so you can check it again; usage may already have been reserved.';

export default function ContextEntry({
  rateLimited = false,
  initialContext = '',
  initialSpreadKey = null,
  orientBusy = false,
  orientError = null,
  onOrient = () => {},
  onResumeOrientation = () => {},
  onQuickDrawSelect,
  onLoadCode,
}) {
  const [context, setContext] = useState(initialContext);
  const [spreadKey, setSpreadKey] = useState(initialSpreadKey);
  const [mode, setMode] = useState('orient');
  const statusUnknown = orientError?.includes('GENERATION_STATUS_UNKNOWN') === true;

  function handleSubmit(event) {
    event.preventDefault();
    if (orientBusy || statusUnknown) return;
    if (!context.trim() || !spreadKey) return;
    onOrient(context.trim(), spreadKey);
  }

  if (!orientBusy && !orientError && (rateLimited || mode === 'quickdraw')) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight">Quick Draw</h1>
          <p className="mt-2 text-sm text-gray-400">Structured randomization forcing novel combinations of systems patterns.</p>
          {rateLimited && (
            <p className="mt-6 rounded-lg border border-gray-700 bg-indigo-900/40 p-4 text-sm leading-relaxed text-gray-300">
              <strong className="text-white">You're tapped out on Orientation Guides for today</strong> — but the cards themselves are always free and unlimited. Draw away, no LLM, no limit. Your Orient-o-meter refills tomorrow.
            </p>
          )}
          <div className="mt-8">
            <SpreadSelector embedded onSelect={onQuickDrawSelect} onLoadCode={onLoadCode} />
          </div>
          {!rateLimited && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setMode('orient')}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Back to Help Me Orient
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <OrnamentalDivider />
        <div className="mt-12">
          <h1 className="text-4xl font-bold tracking-tight">Help Me Orient</h1>
          <p className="mt-2 text-sm text-gray-400">Systems Thinking Tarot</p>
        </div>
        <form noValidate onSubmit={handleSubmit}>
          <div className="mt-8">
            <label htmlFor="context" className="text-xs font-semibold uppercase tracking-widest text-gray-400">Context</label>
            <div className="mt-2">
              <textarea
                id="context"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder={CONTEXT_HINT}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 min-h-40 resize-y text-sm leading-relaxed placeholder:italic placeholder-gray-600"
              />
            </div>
          </div>
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Spread</p>
            <div className="mt-2">
              <SpreadSelector
                embedded
                selectedKey={spreadKey}
                showLoadDraw={false}
                onSelect={setSpreadKey}
                onLoadCode={() => false}
              />
            </div>
          </div>
          <div className="mt-8 flex justify-center">
            <button
              type="submit"
              disabled={orientBusy || statusUnknown || !context.trim() || !spreadKey}
              className="rounded-lg bg-indigo-600 px-8 py-3 font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Help Me Orient
            </button>
          </div>
          {orientBusy ? (
            <p role="status" className="mt-4 text-center text-sm text-gray-400">
              Reading the cards and the world...
            </p>
          ) : orientError ? (
            <div className="mt-4 text-center">
              <p role="alert" className="text-sm text-red-400">
                {statusUnknown
                  ? STATUS_UNKNOWN
                  : orientError.includes('MONTHLY_BUDGET_EXHAUSTED')
                    ? MONTHLY_ERROR
                    : GENERATION_ERROR}
              </p>
              {statusUnknown && (
                <button
                  type="button"
                  onClick={onResumeOrientation}
                  className="mt-4 rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Check this request again
                </button>
              )}
            </div>
          ) : null}
        </form>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={orientBusy}
            onClick={() => setMode('quickdraw')}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Draw for fun instead
          </button>
        </div>
        <div className="mt-12">
          <OrnamentalDivider />
        </div>
      </div>
    </main>
  );
}
