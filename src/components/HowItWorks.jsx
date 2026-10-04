import { useState } from 'react';
import CardDisplay from './CardDisplay';
import { SPREADS, shuffleAndDraw } from '../utils/deck';
import { gridClass } from './SpreadView';

const buttonClass = 'rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

export default function HowItWorks({ onBack = () => {} }) {
  const [cards, setCards] = useState(() => shuffleAndDraw(3));

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-2xl font-bold">How it works</h1>
        <div className="mx-auto mt-6 max-w-2xl space-y-6 text-gray-300">
          <p>
            This app is built on the OODA loop — Observe, Orient, Decide, Act — a model for
            decision-making under uncertainty. Most people get stuck at <em>Orient</em>: they
            decide from inside whatever framing got them to this moment, so the frame itself goes
            unexamined. The Cards come from my own systems-thinking practice — recurring patterns
            I’ve encoded, one per card, as a vocabulary for talking about a situation. They’re not
            fortune-telling and they don’t predict anything. A draw deliberately hands you an
            unrelated pattern or two and forces your situation to be read through it; that
            friction is the point — it’s a cheap, repeatable way to generate an alternate context
            so you re-orient before you decide, instead of just rationalizing the frame you walked
            in with.
          </p>
          <p>
            <strong className="text-white">Drawing cards</strong> is free, unlimited, and doesn’t
            need an account — try Quick Draw right from this page. Every draw gets a short code,
            so you can send someone the exact same cards instead of describing them. After a full
            Guide (below), you can redraw fresh or tweak your draw while keeping what you already
            wrote.
          </p>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Three Card · {SPREADS.three.description}
            </p>
            <button
              type="button"
              onClick={() => setCards(shuffleAndDraw(3))}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Draw again
            </button>
          </div>
          <div className={`mt-4 grid gap-6 ${gridClass(cards.length)}`}>
            {cards.map((card, i) => (
              <CardDisplay key={`${card.name}-${i}`} card={card} position={SPREADS.three.positions[i]} />
            ))}
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-2xl space-y-6 text-gray-300">
          <p>
            <strong className="text-white">The Orientation Guide</strong> goes a step further:
            describe the decision you’re weighing, and the app pulls in live Current Events
            related to it, then an LLM reads your situation through the Cards in one shot. The
            result isn’t advice or a summary — it’s a different way of seeing the decision you’re
            already in. Guides are capped per day per person, and the app runs on a shared monthly
            AI budget — if either limit is hit, Quick Draw keeps working while you wait for the
            reset. If you close the tab mid-Guide, reopening the app picks the request back up
            instead of losing it.
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <a
            href={`${import.meta.env.BASE_URL}images/guide-example.png`}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={`${import.meta.env.BASE_URL}images/guide-example.png`}
              alt="Example Orientation Guide: drawn cards, live Current Events, and the generated guide"
              className="max-w-full rounded-2xl border border-gray-700 shadow-xl"
            />
          </a>
        </div>

        <div className="mx-auto mt-6 max-w-2xl space-y-6 border-t border-gray-800 pt-6 text-gray-300">
          <p>
            <strong className="text-white">Data retention:</strong> what you type and the Guide
            you get back aren’t kept past 24 hours. That’s not enough to build a history or
            personalize anything — it’s there only so a broken request can be debugged and fixed
            while it’s still fresh. Expect that window to keep shrinking.
          </p>
          <p>
            <strong className="text-white">Cost:</strong> this app is free, for now — we’re
            testing whether people actually use it. Each account gets 10 full Guide outputs a
            day. You know the phrase, “if the service is free, you’re the product”? You don’t
            want to be our product. Eventually this will cost $12/year — a buck a month. Not too
            shabby.
          </p>
        </div>

        <div className="mx-auto mt-6 max-w-2xl space-y-6 text-gray-300">
          <p>
            <strong className="text-white">Getting in:</strong> access is invite-only while this
            is still being tested. No key? Leave your name and email and I’ll follow up
            personally. Have a first-generation account? Open <strong className="text-white">Your
            account</strong>, click <strong className="text-white">Grant Invite Key</strong>, and
            copy the code the moment it appears — it’s shown once, so send it to your friend right
            away. They redeem it at sign-up; their account is second-generation and can’t mint a
            key of its own — for now, onward invites are a one-generation chain, which is how
            we’re keeping an eye on who’s sharing the app.
          </p>
        </div>
        <button type="button" onClick={onBack} className={`mt-8 ${buttonClass}`}>
          Back
        </button>
      </div>
    </main>
  );
}
