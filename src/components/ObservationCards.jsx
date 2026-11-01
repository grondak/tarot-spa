import { formatTime, laneColor, safeHref } from '../utils/observation/timeline';
import { emptyMessage, metaText, relatedReason } from '../utils/observation/view';

function TitleLink({ item }) {
  const href = safeHref(item.link);
  const text = item.title || item.link;
  if (!href) return <span className="font-semibold text-white">{text}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:underline">
      {text}
    </a>
  );
}

function Card({ item, model, view }) {
  const related = view.isRelated(item);
  return (
    <article
      className={`rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5 border-l-4`}
      style={{ borderLeftColor: laneColor(model, item.lane), borderLeftStyle: related ? 'dashed' : 'solid' }}
    >
      <div className="text-xs text-gray-400">
        {model.feeds[item.lane].name} · {formatTime(item.ms)}{item.estimated ? ' (date estimated)' : ''}
      </div>
      <TitleLink item={item} />
      {related && (
        <div className="mt-1 text-xs text-indigo-300">Related, not exact: {relatedReason(item, view.alts)}</div>
      )}
      {item.summary && <p className="mt-1 text-[13px] text-gray-400">{item.summary.slice(0, 220)}</p>}
    </article>
  );
}

export default function ObservationCards({ model, view, search }) {
  const shown = view.inWin.slice(0, view.cardCount);
  const rest = view.inWin.slice(view.cardCount);
  return (
    <>
      <p className="my-2 text-sm text-gray-400">{metaText(view)}</p>
      {view.inWin.length === 0 && <p className="py-6 text-gray-400">{emptyMessage(view, search)}</p>}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {shown.map((item) => <Card key={item.id} item={item} model={model} view={view} />)}
      </div>
      {rest.length > 0 && (
        <details className="mt-3 text-sm text-gray-300">
          <summary className="cursor-pointer">+{rest.length} more in this window at lower rank</summary>
          <ul className="mt-2 space-y-1">
            {rest.map((item) => (
              <li key={item.id}>
                {model.feeds[item.lane].name} · {formatTime(item.ms)} · <TitleLink item={item} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
