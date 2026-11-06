import { useState } from 'react';
import OrnamentalDivider from './OrnamentalDivider';
import SpreadSelector from './SpreadSelector';
import CardDisplay from './CardDisplay';
import { gridClass } from './SpreadView';
import { SPREADS, shuffleAndDraw, encodeDraw } from '../utils/deck';

const CONTEXT_HINT = 'Tell me about your upcoming decision, and what you know or think you know about the situation.';
const SAMPLE_SEEDS = [
  {
    label: 'A career crossroads',
    context: "I've been offered a senior role at a 12-person startup — 15% less base pay, but equity and a title bump. My current company has been stable for three years, but I've had the same scope since my last promotion 18 months ago, and two peers who joined after me have since been promoted past me. The startup's product is in a market I don't fully understand yet, and their last funding round closed only four months ago. I keep telling myself I want 'growth,' but I haven't actually looked for other roles at my current company first. My partner is supportive either way but just started a demanding new job of their own this year.",
  },
  {
    label: 'A team disagreement',
    context: "A close friend and I started a side project seven weeks ago, nights and weekends, no deadline from anyone but ourselves. I want to ship something rough in the next two weeks so we can get real user feedback; they want another six to eight weeks to get the core flow right before anyone sees it. We've slipped two self-imposed 'soft launch' dates already. Neither of us has shipped a side project to real users before. I notice I get anxious when things stay unfinished, and they get anxious when things go out imperfect — so I can't tell if I'm right that we need feedback, or just impatient to feel done.",
  },
  {
    label: 'A money tradeoff',
    context: "I have about $14,000 in savings beyond my emergency fund. I've been wanting to take six weeks to travel somewhere I've never been — something I've talked about for three years but never actually booked. At the same time, I'm saving for a home down payment, and at my current rate I'm about two years from a 10% down payment in my market; spending the $14,000 on travel would push that timeline out by roughly a year. I don't have a trip booked, a destination picked, or time off approved yet — it's still entirely hypothetical. I keep framing it as 'now or never,' but I've been saying that for three years already.",
  },
];
const GENERATION_ERROR = 'Something went wrong generating your Guide — nothing was used up. Your context is still here; try again.';
const MONTHLY_ERROR = "Everyone's shared monthly Guide budget is spent — Orientation Guides return when the month rolls over. Quick Draw is always free.";
const STATUS_UNKNOWN = 'Your Guide is taking longer than expected. We kept this request so you can check it again; usage may already have been reserved.';

function drawFor(key) {
  return key ? shuffleAndDraw(SPREADS[key].positions.length) : [];
}

export default function ContextEntry({
  rateLimited = false,
  initialContext = '',
  initialSpreadKey = null,
  observedItems = [],
  onRemoveObserved = () => {},
  orientBusy = false,
  orientError = null,
  onOrient = () => {},
  onResumeOrientation = () => {},
  onQuickDrawSelect,
  onLoadCode,
}) {
  const [context, setContext] = useState(initialContext);
  const [spreadKey, setSpreadKey] = useState(initialSpreadKey);
  const [cards, setCards] = useState(() => drawFor(initialSpreadKey));
  const [mode, setMode] = useState('orient');
  const statusUnknown = orientError?.includes('GENERATION_STATUS_UNKNOWN') === true;

  function handleSubmit(event) {
    event.preventDefault();
    if (orientBusy || statusUnknown) return;
    if (!context.trim() || !spreadKey || cards.length === 0) return;
    onOrient(context.trim(), spreadKey, encodeDraw(spreadKey, cards));
  }

  function handleSelectSpread(key) {
    setSpreadKey(key);
    setCards(drawFor(key));
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
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Not sure what to write? Try one</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SAMPLE_SEEDS.map((seed) => (
                <button
                  key={seed.label}
                  type="button"
                  onClick={() => setContext(seed.context)}
                  disabled={orientBusy}
                  className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {seed.label}
                </button>
              ))}
            </div>
          </div>
          {observedItems.length > 0 && (
            <section aria-labelledby="observed-heading" className="mt-8 rounded-lg border border-indigo-400/40 bg-gray-900 p-4">
              <h2 id="observed-heading" className="text-xs font-semibold uppercase tracking-widest text-indigo-300">From the Observation Window</h2>
              <p className="mt-1 text-sm text-gray-400">
                Your Guide will read these as Current Events, in place of its own news search. Remove any you don't want.
              </p>
              <ul className="mt-3 space-y-2">
                {observedItems.map((item, index) => (
                  <li key={`${item.title}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                    <span>
                      <span className="block text-xs text-gray-400">{item.source} · {item.when}</span>
                      <span className="text-gray-200">{item.title}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove “${item.title}”`}
                      disabled={orientBusy}
                      onClick={() => onRemoveObserved(index)}
                      className="shrink-0 rounded px-2 text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
                onSelect={handleSelectSpread}
                onLoadCode={() => false}
              />
            </div>
          </div>
          {spreadKey && cards.length > 0 && (
            <div className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Your draw</p>
                <button
                  type="button"
                  onClick={() => setCards(drawFor(spreadKey))}
                  disabled={orientBusy}
                  className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Redraw
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Redraw as often as you like, then ask for your Guide with these cards. The ones you didn't want are often the useful ones.
              </p>
              <div className={`mt-4 grid gap-6 ${gridClass(cards.length)}`}>
                {cards.map((card, i) => (
                  <CardDisplay
                    key={`${card.name}-${i}`}
                    card={card}
                    position={SPREADS[spreadKey].positions[i]}
                  />
                ))}
              </div>
            </div>
          )}
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
