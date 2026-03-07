import { useState } from 'react';
import CardDisplay from './CardDisplay';

export default function SpreadView({ spread, cards, drawCode, onDrawAgain, onBack }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(drawCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{spread.label}</h1>
            <p className="text-gray-400 text-sm mt-1">{spread.description}</p>
            {/* Draw code */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-gray-600 text-xs uppercase tracking-wider">Draw</span>
              <code className="text-gray-300 text-xs font-mono bg-gray-800 px-2 py-0.5 rounded">
                {drawCode}
              </code>
              <button
                onClick={handleCopy}
                className="text-gray-500 hover:text-gray-300 transition-colors"
                title="Copy draw code"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onDrawAgain}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Draw Again
            </button>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className={`max-w-6xl mx-auto grid gap-6 ${gridClass(cards.length)}`}>
        {cards.map((card, i) => (
          <CardDisplay
            key={`${card.name}-${i}`}
            card={card}
            position={spread.positions[i]}
          />
        ))}
      </div>
    </div>
  );
}

function gridClass(n) {
  if (n === 1) return 'grid-cols-1 max-w-sm mx-auto';
  if (n === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (n === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  if (n === 4) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';
}

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
