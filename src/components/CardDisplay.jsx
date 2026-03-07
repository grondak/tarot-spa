import { imageFilename } from '../utils/deck';

export default function CardDisplay({ card, position }) {
  const imgSrc = `${import.meta.env.BASE_URL}images/systemsTarot/${imageFilename(card)}`;
  const isMajor = card.cardType === 'Major';
  const { inverted } = card;

  return (
    <div className="flex flex-col bg-gray-900 rounded-2xl overflow-hidden shadow-xl border border-gray-700">
      {/* Position label */}
      {position && (
        <div className="px-4 py-2 bg-indigo-900/60 text-indigo-300 text-xs font-semibold uppercase tracking-widest text-center">
          {position}
        </div>
      )}

      {/* Image */}
      <div className="flex justify-center bg-gray-950 p-3">
        <img
          src={imgSrc}
          alt={card.name}
          className={`rounded-xl object-contain max-h-72 w-auto shadow-lg${inverted ? ' rotate-180' : ''}`}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>

      {/* Text content */}
      <div className="p-4 flex flex-col gap-3">
        {/* Card name + type */}
        <div>
          <h2 className="text-white text-lg font-bold leading-tight">
            {card.name}{inverted ? ', Inverted.' : ''}
          </h2>
          <p className="text-indigo-400 text-xs font-medium mt-0.5">
            {isMajor ? 'Major Arcana' : `${card.cardType} · ${card.number}`}
          </p>
        </div>

        {/* Pattern */}
        <p className={`text-sm leading-relaxed italic border-l-2 pl-3 ${inverted ? 'text-amber-300/90 border-amber-500' : 'text-gray-300 border-indigo-500'}`}>
          {inverted ? card.invertedPattern : card.pattern}
        </p>

        {/* Questions */}
        {card.questions?.length > 0 && (
          <div>
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Questions to ask
            </h3>
            <ul className="space-y-1">
              {card.questions.map((q, i) => (
                <li key={i} className="text-gray-300 text-sm flex gap-2">
                  <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Examples */}
        {card.examples?.length > 0 && (
          <div>
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Examples across domains
            </h3>
            <ul className="space-y-1">
              {card.examples.map((e, i) => (
                <li key={i} className="text-gray-400 text-xs flex gap-2">
                  <span className="text-gray-600 mt-0.5 shrink-0">◦</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
