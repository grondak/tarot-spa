import CardDisplay from './CardDisplay';

export default function SpreadView({ spread, cards, onDrawAgain, onBack }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{spread.label}</h1>
            <p className="text-gray-400 text-sm mt-1">{spread.description}</p>
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
  // Responsive: always 1 col on mobile, sensible cols on wider screens
  if (n === 1) return 'grid-cols-1 max-w-sm mx-auto';
  if (n === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (n === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  if (n === 4) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';
}
