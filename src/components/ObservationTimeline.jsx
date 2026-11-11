import { memo } from 'react';
import {
  axisMarks, formatTime, laneColor, percentAlong,
} from '../utils/observation/timeline';
import { soloKey } from '../utils/observation/view';

const rowGrid = { gridTemplateColumns: 'var(--ow-label) 1fr' };

// Higher stakes in the open case draw a bigger dot (epic S5.2); 0 and 1 stay the normal size.
const STAKES_SIZE = {
  2: 'top-[6px] -ml-[5px] size-[11px]',
  3: 'top-[5px] -ml-[6px] size-[13px]',
};

const Dot = memo(function Dot({ left, color, title, estimated, inWindow, off, related, injected, onJump, ms, stakes }) {
  const classes = [
    'absolute cursor-pointer rounded-full',
    STAKES_SIZE[stakes] ?? 'top-[7px] -ml-1 size-[9px]',
    estimated ? 'border-2 !bg-transparent' : '',
    off ? 'pointer-events-none z-0 opacity-[0.07]' : inWindow ? 'z-[2] scale-[1.35] opacity-100' : 'opacity-45',
    related && !off ? 'outline outline-1 outline-offset-1 outline-white' : '',
    injected && !off ? 'outline outline-1 outline-offset-1 outline-dashed outline-white' : '',
  ].join(' ');
  // The dots are a mouse shortcut for the slider; keyboard users scrub with the slider and
  // the match buttons, and the cards carry the readable text.
  return (
    <div
      aria-hidden="true"
      title={title}
      className={classes}
      style={{ left: `${left}%`, background: color, borderColor: color }}
      onClick={() => onJump(ms)}
    />
  );
});

function SoloButton({ keyName, what, on, onToggle }) {
  return (
    <button
      type="button"
      data-solo={keyName}
      aria-pressed={on}
      aria-label={`Solo ${what}`}
      title={`Solo ${what}: dim everything else and show only its cards`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(keyName);
      }}
      className={`shrink-0 rounded px-1.5 text-[10px] font-bold leading-4 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        on ? 'bg-indigo-400 text-gray-950 opacity-100' : 'border border-gray-800 bg-gray-900 text-white opacity-35 group-hover:opacity-100'
      }`}
    >
      S
    </button>
  );
}

export default function ObservationTimeline({
  model, view, solo, collapsed, onToggleCollapsed, onToggleSolo, onJump, stakes = null,
}) {
  const dotsFor = (items) => items.map((item) => (
    <Dot
      key={item.id}
      ms={item.ms}
      left={percentAlong(model, item.ms)}
      color={laneColor(model, item.lane)}
      estimated={item.estimated}
      inWindow={item.ms >= view.lo && item.ms <= view.hi}
      off={!view.isFocused(item)}
      related={view.isRelated(item)}
      injected={item.injected}
      stakes={stakes?.get(item.id) ?? 0}
      title={`${item.injected ? 'Outside your interests: ' : ''}${model.feeds[item.lane].name}\n${item.title}\n${formatTime(item.ms)}${item.estimated ? ' (date estimated)' : ''}`}
      onJump={onJump}
    />
  ));

  const bandLo = Math.max(view.lo, model.start);
  const bandHi = Math.min(view.hi, model.end);
  const marks = axisMarks(model);

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
      {model.groups.map((group, groupIndex) => {
        const closed = collapsed.has(group.name);
        const groupSolo = solo.has(soloKey.group(group.name));
        const feedSolo = (lane) => solo.has(soloKey.feed(model.feeds[lane].id));
        const count = view.inWin.filter((i) => group.lanes.includes(i.lane)).length;
        const groupDim = (view.soloing && !groupSolo && !group.lanes.some(feedSolo))
          || (view.searching && !group.lanes.some((lane) => view.matchLanes.has(lane)));
        return (
          <div key={group.name}>
            {/* The group row is a submix: all the group's dots together; click to open or close it. */}
            <div
              data-testid={`group-${group.name}`}
              className={`group grid h-6 cursor-pointer items-center bg-gray-800/40 font-semibold ${groupIndex ? 'border-t border-gray-800' : ''}`}
              style={rowGrid}
              onClick={() => onToggleCollapsed(group.name)}
            >
              <div className="flex min-w-0 items-center gap-1 px-2 text-xs">
                <button
                  type="button"
                  aria-expanded={!closed}
                  className={`min-w-0 flex-1 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${groupDim ? 'opacity-40' : ''}`}
                >
                  <span className="text-gray-400">{closed ? '▸ ' : '▾ '}</span>
                  {group.name}
                  {count > 0 && <small className="ml-1 font-normal text-gray-400">({count})</small>}
                </button>
                <SoloButton keyName={soloKey.group(group.name)} what={group.name} on={groupSolo} onToggle={onToggleSolo} />
              </div>
              <div className="relative h-full">
                {dotsFor(model.items.filter((i) => group.lanes.includes(i.lane)))}
              </div>
            </div>
            {!closed && group.lanes.map((lane) => {
              const feed = model.feeds[lane];
              const dim = (view.soloing && !groupSolo && !feedSolo(lane))
                || (view.searching && !view.matchLanes.has(lane));
              return (
                <div
                  key={feed.id}
                  data-testid={`lane-${feed.id}`}
                  className="group grid h-6 items-center border-t border-gray-800"
                  style={rowGrid}
                >
                  <div className="flex min-w-0 items-center gap-1 pl-[22px] pr-2 text-xs">
                    <span
                      className={`min-w-0 flex-1 truncate ${dim ? 'opacity-40' : ''}`}
                      title={feed.retired ? `${feed.name} (${feed.group}): no longer collected` : `${feed.name} (${feed.group})`}
                    >
                      {feed.name}
                      {feed.retired && <small className="ml-1 text-gray-400">(retired)</small>}
                    </span>
                    <SoloButton keyName={soloKey.feed(feed.id)} what={feed.name} on={feedSolo(lane)} onToggle={onToggleSolo} />
                  </div>
                  <div className="relative h-full">{dotsFor(model.items.filter((i) => i.lane === lane))}</div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Over the dot area: five-day ticks, collector gaps, the window band and the needle. */}
      <div className="pointer-events-none absolute bottom-[18px] right-0 top-0" style={{ left: 'var(--ow-label)' }}>
        {marks.map((mark) => (
          <div key={mark.ms} className="absolute inset-y-0 border-l border-dashed border-gray-800" style={{ left: `${percentAlong(model, mark.ms)}%` }} />
        ))}
        {model.gaps.map(([from, to]) => {
          const left = percentAlong(model, Math.max(from, model.start));
          return (
            <div
              key={from}
              data-testid="gap"
              title={`Collector did not run ${formatTime(from)} to ${formatTime(to)}`}
              className="absolute inset-y-0"
              style={{
                left: `${left}%`,
                width: `${Math.max(0.15, percentAlong(model, to) - left)}%`,
                background: 'repeating-linear-gradient(45deg, rgba(153,161,175,.22) 0 4px, transparent 4px 8px)',
              }}
            />
          );
        })}
        <div
          data-testid="band"
          className="absolute inset-y-0 bg-indigo-500/15"
          style={{ left: `${percentAlong(model, bandLo)}%`, width: `${percentAlong(model, bandHi) - percentAlong(model, bandLo)}%` }}
        />
        <div
          data-testid="needle"
          className="absolute inset-y-0 -ml-px w-0.5 bg-indigo-400"
          style={{ left: `${percentAlong(model, view.t)}%` }}
        />
      </div>

      <div className="grid border-t border-gray-800 text-[11px] text-gray-400" style={rowGrid}>
        <div />
        <div className="relative h-[18px]">
          {marks.map((mark) => (
            <span
              key={mark.ms}
              className={`absolute top-0.5 whitespace-nowrap ${mark.ms === model.end ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${percentAlong(model, mark.ms)}%` }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
