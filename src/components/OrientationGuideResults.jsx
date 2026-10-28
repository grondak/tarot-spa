import { useState } from 'react';
import { FULL_DECK } from '../data/systemsTarot';
import { SPREADS } from '../utils/deck';
import CardDisplay from './CardDisplay';
import OrnamentalDivider from './OrnamentalDivider';
import { gridClass } from './SpreadView';

const TIMEOUT_NOTE = 'The news is slow today — this Guide worked from the cards and your own words alone.';

export default function OrientationGuideResults({
  result,
  onRedrawFresh = () => {},
  onRedrawTweak = () => {},
  onSave,
  showRedraw = true,
}) {
  const [saveStatus, setSaveStatus] = useState('idle');
  const spread = SPREADS[result.spreadKey];
  const cards = result.cards
    .map(({ name, position, inverted }) => {
      const card = FULL_DECK.find((candidate) => candidate.name === name);
      return card ? { card: { ...card, inverted }, position } : null;
    })
    .filter(Boolean);
  const paragraphs = result.guide
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const question = typeof result.context === 'string' ? result.context.trim() : '';
  const showEvents = result.tavilyTimedOut || result.currentEvents.length > 0;

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-bold">Your Orientation Guide</h1>
        <p className="mt-1 text-sm text-gray-400">
          {spread.label} · {spread.description}
        </p>

        {question && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Your Question
            </h2>
            <p className="mt-4 whitespace-pre-line break-words rounded-xl border border-gray-800 bg-gray-900 px-6 py-4 text-gray-200">
              {question}
            </p>
          </section>
        )}

        <section className="mt-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Your Draw
          </h2>
          <div className={`mt-4 grid gap-6 ${gridClass(cards.length)}`}>
            {cards.map((entry) => (
              <CardDisplay
                key={`${entry.card.name}-${entry.position}`}
                card={entry.card}
                position={entry.position}
              />
            ))}
          </div>
        </section>

        {showEvents && (
          <section className="mt-12">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Current Events
            </h2>
            {result.tavilyTimedOut ? (
              <p className="mt-4 rounded-lg border border-gray-700 bg-indigo-900/40 p-4 text-sm leading-relaxed text-gray-300">
                {TIMEOUT_NOTE}
              </p>
            ) : (
              <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 px-6 py-2">
                <ul>
                  {result.currentEvents.map((event) => (
                    <li
                      key={`${event.title}-${event.content}`}
                      className="border-b border-gray-800 last:border-b-0 py-3 text-sm leading-relaxed"
                    >
                      <p className="text-gray-200 font-medium">{event.title}</p>
                      <p className="mt-1 text-gray-400">{event.content}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>

      <section className="mx-auto mt-12 w-full max-w-2xl">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Your Orientation Guide
        </h2>
        <div className="mt-4">
          {paragraphs.map((paragraph) => (
            <p
              key={paragraph}
              className="mt-5 first:mt-0 text-lg leading-8 text-gray-200"
            >
              {paragraph}
            </p>
          ))}
        </div>
        <div className="mt-12">
          <OrnamentalDivider />
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3 print:hidden">
          {showRedraw && (
            <>
              <button
                type="button"
                onClick={onRedrawFresh}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Provide another observation
              </button>
              <button
                type="button"
                onClick={onRedrawTweak}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Tweak existing observation
              </button>
            </>
          )}
          {onSave && (
            <button
              type="button"
              onClick={() => setSaveStatus(onSave() ? 'saved' : 'error')}
              disabled={saveStatus === 'saved'}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-default disabled:opacity-70"
            >
              {saveStatus === 'saved' ? 'Saved to this device' : 'Save to this device'}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Download PDF
          </button>
        </div>
        {saveStatus === 'error' && (
          <p role="alert" className="mt-4 text-center text-sm text-red-400 print:hidden">
            This reading couldn’t be saved — your browser may be blocking storage.
          </p>
        )}
      </section>
    </main>
  );
}
