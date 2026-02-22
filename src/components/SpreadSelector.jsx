import { SPREADS } from '../utils/deck';

export default function SpreadSelector({ onSelect }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      {/* Title */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
          Systems Thinking Tarot
        </h1>
        <p className="text-gray-400 text-lg max-w-md">
          Structured randomization forcing novel combinations of systems patterns.
        </p>
      </div>

      {/* Spread buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
        {Object.entries(SPREADS).map(([key, spread]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className="group flex flex-col items-start gap-1.5 p-5 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500 rounded-2xl text-left transition-all"
          >
            <span className="text-white font-semibold text-base group-hover:text-indigo-300 transition-colors">
              {spread.label}
            </span>
            <span className="text-gray-400 text-sm">
              {spread.description}
            </span>
            <span className="text-gray-600 text-xs mt-1">
              {spread.positions.length} {spread.positions.length === 1 ? 'card' : 'cards'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
