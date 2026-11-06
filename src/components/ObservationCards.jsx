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

function Card({ item, model, view, onDismiss }) {
  const feed = model.feeds[item.lane];
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
      {item.injected && (
        <div className="mt-1 text-xs text-amber-300">
          <strong>Outside your interests.</strong> {feed.reason}{' '}
          <button
            type="button"
            className="underline hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            onClick={() => onDismiss(feed.id)}
          >
            Not interested in {feed.name}
          </button>
        </div>
      )}
      {related && (
        <div className="mt-1 text-xs text-indigo-300">Related, not exact: {relatedReason(item, view.alts)}</div>
      )}
      {item.summary && <p className="mt-1 text-[13px] text-gray-400">{item.summary.slice(0, 220)}</p>}
    </article>
  );
}

export default function ObservationCards({ model, view, search, onDismiss, onOrient, orientBlocked = false }) {
  const shown = view.inWin.slice(0, view.cardCount);
  const rest = view.inWin.slice(view.cardCount);
  return (
    <>
      <div className="my-2 flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-400">{metaText(view)}</p>
        {onOrient && shown.length > 0 && (
          <button
            type="button"
            disabled={orientBlocked}
            title={orientBlocked ? 'Finish or redraw your current Guide first' : 'Send these cards to Orient as your Context'}
            onClick={() => onOrient(shown)}
            className="rounded-md border border-indigo-400 bg-gray-900 px-2.5 py-1 text-sm text-indigo-300 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40"
          >
            Orient on this moment
          </button>
        )}
      </div>
      {view.inWin.length === 0 && <p className="py-6 text-gray-400">{emptyMessage(view, search)}</p>}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {shown.map((item) => <Card key={item.id} item={item} model={model} view={view} onDismiss={onDismiss} />)}
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
