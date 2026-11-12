import { useMemo, useState } from 'react';
import { laneVolumes, MIN_BASELINE_DAYS } from '../utils/observation/baseline';
import { laneColor } from '../utils/observation/timeline';

const buttonClass = 'rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-sm text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const ORDER = { busier: 0, quieter: 1, normal: 2 };
const STATE_TEXT = { busier: 'busier than normal', quieter: 'quieter than normal', normal: 'about normal' };
const one = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function headline(volumes) {
  if (volumes.status === 'thin') return 'Not enough history yet to say what is normal.';
  const busier = volumes.lanes.filter((l) => l.state === 'busier').length;
  const quieter = volumes.lanes.filter((l) => l.state === 'quieter').length;
  if (busier === 0 && quieter === 0) return 'Every lane is about normal for this window.';
  const parts = [];
  if (busier) parts.push(`${busier} ${busier === 1 ? 'lane' : 'lanes'} busier than normal`);
  if (quieter) parts.push(`${quieter} quieter`);
  return `${parts.join(', ')}.`;
}

function LaneRow({ model, lane }) {
  const scale = Math.max(lane.actual, lane.expected * 2, 1);
  return (
    <li className="grid items-center gap-2 text-sm" style={{ gridTemplateColumns: 'minmax(8rem, 14rem) 1fr' }}>
      <span className="truncate text-gray-300" title={lane.name}>{lane.name}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="relative h-2 w-40 shrink-0 rounded bg-gray-800"
          data-testid={`volume-${lane.id}`}
        >
          <span
            className="absolute inset-y-0 left-0 rounded"
            style={{
              width: `${(lane.actual / scale) * 100}%`,
              background: laneColor(model, lane.lane),
              opacity: lane.state === 'busier' ? 1 : 0.45,
            }}
          />
          <span className="absolute -inset-y-0.5 w-px bg-white" style={{ left: `${(lane.expected / scale) * 100}%` }} />
        </span>
        <span className={`text-xs ${lane.state === 'busier' ? 'font-semibold text-amber-300' : 'text-gray-400'}`}>
          {lane.actual} in this window · normal about {one(lane.expected)} · {STATE_TEXT[lane.state]}
        </span>
      </span>
    </li>
  );
}

// Each lane's volume in the window on screen against its normal. Timing and counts only: a busy
// lane says a beat is active, not why.
export default function ObservationBaseline({ model, view }) {
  const [open, setOpen] = useState(false);
  const volumes = useMemo(() => laneVolumes(model, view), [model, view]);
  const sorted = useMemo(
    () => [...volumes.lanes].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.lane - b.lane),
    [volumes],
  );
  return (
    <section aria-labelledby="baseline-heading" className="mt-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="baseline-heading" className="text-sm font-semibold text-gray-300">Volume against normal</h2>
        <p className="text-sm text-gray-400" data-testid="baseline-summary">{headline(volumes)}</p>
        {volumes.status === 'ready' && (
          <button type="button" className={buttonClass} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide lanes' : 'Show lanes'}
          </button>
        )}
      </div>
      {volumes.status === 'thin' && (
        <p className="mt-1 text-xs text-gray-400">
          It takes at least {MIN_BASELINE_DAYS} complete days of counts outside this window; there are {volumes.days}.
        </p>
      )}
      {volumes.status === 'ready' && open && (
        <div className="mt-2 space-y-2">
          <ul className="space-y-1.5">
            {sorted.map((lane) => <LaneRow key={lane.id} model={model} lane={lane} />)}
          </ul>
          <p className="text-xs text-gray-400">
            Normal is each source’s average over the {volumes.days} complete days of counts since {volumes.since}, outside this window,
            scaled to this window’s length. The white tick marks it. It doesn’t adjust for weekends yet. A busy lane shows a beat is active, not why.
          </p>
        </div>
      )}
    </section>
  );
}
