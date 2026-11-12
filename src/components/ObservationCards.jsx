import { formatDay } from '../utils/observation/expected';
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

const STANCE_LABEL = {
  SUPPORTS: 'Supports your hypothesis',
  CUTS_AGAINST: 'Cuts against your hypothesis',
  NOT_RELEVANT: 'Marked not relevant',
};
const tagButton = 'rounded border border-gray-700 px-1.5 py-0.5 text-xs text-gray-200 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

// What the user can say about one card for the open case. The Window only proposes that a card
// looks relevant, with the words that matched; supports or cuts against is always the user's call.
// Stakes, 0 to 3, worked out by plain rules from the user's own case words; the user can set any item's.
function StakesRow({ item, tagging }) {
  const { stakes, why } = tagging.stakesOf(item);
  const mine = Number.isInteger(tagging.tags.get(item.id)?.stakes);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-400" role="group" aria-label="Stakes for your case">
      <span><strong className="text-gray-200">Stakes {stakes} of 3.</strong>{why && ` ${why}`}</span>
      {[0, 1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={stakes === n}
          aria-label={`Set stakes to ${n}`}
          className={`${tagButton} ${stakes === n ? '!border-indigo-400 !text-indigo-300' : ''}`}
          onClick={() => tagging.onRate(item, n)}
        >
          {n}
        </button>
      ))}
      {mine && <button type="button" className={tagButton} onClick={() => tagging.onRate(item, null)}>Use the rules</button>}
    </div>
  );
}

function CaseTagRow({ item, tagging }) {
  const tag = tagging.tags.get(item.id)?.stance ? tagging.tags.get(item.id) : null;
  const words = tagging.relevant.get(item.id);
  if (tag) {
    const flipTo = tag.stance === 'SUPPORTS' ? 'CUTS_AGAINST' : 'SUPPORTS';
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-emerald-300">
        <span><strong>{STANCE_LABEL[tag.stance]}.</strong> Set by you.</span>
        {tag.stance !== 'NOT_RELEVANT' && (
          <button type="button" className={tagButton} onClick={() => tagging.onTag(item, flipTo)}>
            Change to {flipTo === 'SUPPORTS' ? 'Supports' : 'Cuts against'}
          </button>
        )}
        <button type="button" className={tagButton} onClick={() => tagging.onUntag(item)}>Clear</button>
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
      <span>
        {words
          ? <><strong className="text-indigo-300">Looks relevant to your case</strong> (proposed). Matches: {words.slice(0, 4).join(', ')}.</>
          : 'Tag for your case:'}
      </span>
      <button type="button" className={tagButton} onClick={() => tagging.onTag(item, 'SUPPORTS')}>Supports</button>
      <button type="button" className={tagButton} onClick={() => tagging.onTag(item, 'CUTS_AGAINST')}>Cuts against</button>
      {words && <button type="button" className={tagButton} onClick={() => tagging.onTag(item, 'NOT_RELEVANT')}>Not relevant</button>}
    </div>
  );
}

function Card({ item, model, view, onDismiss, tagging }) {
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
      {tagging && <CaseTagRow item={item} tagging={tagging} />}
      {tagging && <StakesRow item={item} tagging={tagging} />}
    </article>
  );
}

// An event the user expected for the open case that did not arrive (S5.5): the dog that didn't bark.
function AbsenceCard({ absence }) {
  const { event } = absence;
  return (
    <article className="rounded-lg border border-dashed border-gray-500 bg-gray-900 px-3 py-2.5" data-testid="absence-card">
      <div className="text-xs text-gray-400">Expected around {formatDay(absence.expectedMs)}, give or take {event.tolerance} {event.tolerance === 1 ? 'day' : 'days'}</div>
      <p className="mt-0.5 font-semibold text-white">{event.name}</p>
      <p className="mt-1 text-sm text-gray-300"><strong>Expected, didn’t happen.</strong> No item with “{event.words}” from any source.</p>
    </article>
  );
}

export default function ObservationCards({
  model, view, search, onDismiss, onOrient, orientBlocked = false, tagging = null, absences = [],
}) {
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
            title="Send these cards to Orient as Current Events"
            onClick={() => onOrient(shown)}
            className="rounded-md border border-indigo-400 bg-gray-900 px-2.5 py-1 text-sm text-indigo-300 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40"
          >
            Orient on this moment
          </button>
        )}
        {onOrient && shown.length > 0 && orientBlocked && (
          <p className="text-sm text-gray-400">A Guide is in progress or on screen. Finish or redraw it in Orient first.</p>
        )}
      </div>
      {view.inWin.length === 0 && absences.length === 0 && <p className="py-6 text-gray-400">{emptyMessage(view, search)}</p>}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {absences.map((absence) => <AbsenceCard key={`${absence.event.id}-${absence.expectedMs}`} absence={absence} />)}
        {shown.map((item) => <Card key={item.id} item={item} model={model} view={view} onDismiss={onDismiss} tagging={tagging} />)}
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
