import { useState } from 'react';
import { decodeDraw, encodeDraw, shuffleAndDraw, SPREADS } from '../utils/deck';
import SpreadSelector from './SpreadSelector';
import SpreadView from './SpreadView';
import RequestAccess from './RequestAccess';

const JOBS = [
  ['Functional', "See it from a different angle — not another pro/con list you could've made yourself."],
  ['Emotional', 'An "oh" moment — a reframe, not an opinion or a recommendation.'],
  ['Social', 'Something worth sharing afterward — a phrase, a line, a reframe you want to show someone else.'],
];

export default function PublicLanding({ onShowSignUp = () => {}, onShowLogIn = () => {} }) {
  const [spreadKey, setSpreadKey] = useState(null);
  const [cards, setCards] = useState([]);

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

  if (spreadKey) {
    return (
      <SpreadView
        spread={SPREADS[spreadKey]}
        cards={cards}
        drawCode={encodeDraw(spreadKey, cards)}
        onDrawAgain={handleDrawAgain}
        onBack={handleBack}
      />
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6 text-white">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onShowSignUp}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          I have an Invite Key
        </button>
        <button
          type="button"
          onClick={onShowLogIn}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Log In
        </button>
      </header>

      <section className="mx-auto max-w-5xl py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Systems Thinking Tarot</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-300">
          Most bad decisions aren't made because people lack information — they're made because people are oriented incorrectly before they decide. Draw your own Cards, Current Events are sourced live, and an LLM applies a systems-thinking Lens to your own situation in one shot — producing an Orientation Guide: not advice, not a summary, a different way of seeing the decision in front of you.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {JOBS.map(([label, body]) => (
            <article key={label} className="max-w-xs rounded-xl border border-gray-700 bg-gray-900 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">{label}</p>
              <p className="mt-2 text-sm text-gray-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl border-t border-gray-800 py-12">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Try It Now — No Account Needed</p>
          <h2 className="mt-2 text-2xl font-bold">Quick Draw</h2>
          <p className="mt-2 text-sm text-gray-400">Structured randomization forcing novel combinations of systems patterns. Free, unlimited, no login.</p>
        </div>
        <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <SpreadSelector embedded onSelect={handleSelect} onLoadCode={handleLoadCode} />
        </div>
      </section>

      <RequestAccess />
    </main>
  );
}
