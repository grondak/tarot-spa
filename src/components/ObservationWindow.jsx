import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stemmer } from 'stemmer';
import ObservationCards from './ObservationCards';
import ObservationTimeline from './ObservationTimeline';
import { loadObservationData, widenSearchTerm } from '../utils/observation/data';
import { LEVEL_NAMES, MIN_CARDS, parseSearch } from '../utils/observation/search';
import { HOUR, buildModel, formatTime } from '../utils/observation/timeline';
import {
  WINDOW_OPTIONS, computeView, expandableTerms, searchCountText,
} from '../utils/observation/view';

const COLLAPSED_KEY = 'owCollapsedGroups';
const CARD_COUNTS = [3, 6, 12, 24];
const PLAY_STEP_MS = 80;

const buttonClass = 'rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-sm text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40';
const accentButtonClass = `${buttonClass} !border-indigo-400 !text-indigo-300`;

function readCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function writeCollapsed(collapsed) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Storage unavailable: the groups just open again next time.
  }
}

export default function ObservationWindow({
  loadFn = loadObservationData,
  widenFn = widenSearchTerm,
  nowFn = Date.now,
}) {
  const [loadState, setLoadState] = useState({ status: 'loading' });
  const [loadRevision, setLoadRevision] = useState(0);
  // null means "live": the right-hand end of the axis.
  const [position, setPosition] = useState(null);
  const [windowHours, setWindowHours] = useState(24);
  const [cardCount, setCardCount] = useState(6);
  const [solo, setSolo] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [searchText, setSearchText] = useState('');
  const [whole, setWhole] = useState(false);
  const [expansions, setExpansions] = useState(() => new Map());
  const [blocked, setBlocked] = useState(() => new Set());
  const [playing, setPlaying] = useState(false);
  const asked = useRef(new Set());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadFn()
      .then((data) => {
        if (active) setLoadState({ status: 'ready', data, loadedAt: nowFn() });
      })
      .catch(() => {
        if (active) setLoadState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [loadFn, nowFn, loadRevision]);

  const model = useMemo(() => (loadState.status === 'ready'
    ? buildModel({ ...loadState.data, now: loadState.loadedAt, stem: stemmer })
    : null), [loadState]);
  const search = useMemo(() => parseSearch(searchText, whole), [searchText, whole]);

  // Ask WordNet about each new word once; a failed lookup just means no widening for that word.
  // It stays asked even if the user types on, so an answer is never thrown away.
  useEffect(() => {
    for (const term of expandableTerms(search)) {
      if (asked.current.has(term)) continue;
      asked.current.add(term);
      widenFn(term)
        .then((expansion) => {
          if (mounted.current) setExpansions((prev) => new Map(prev).set(term, expansion));
        })
        .catch(() => {});
    }
  }, [search, widenFn]);

  const t = model ? Math.min(model.end, Math.max(model.start, position ?? model.end)) : 0;

  // Playback runs the needle forward an hour a tick and stops by itself at "now".
  const isPlaying = playing && model !== null && t < model.end;
  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = setInterval(() => {
      setPosition((prev) => Math.min(model.end, (prev ?? model.end) + HOUR));
    }, PLAY_STEP_MS);
    return () => clearInterval(timer);
  }, [isPlaying, model]);

  const view = useMemo(() => (model
    ? computeView(model, { t, windowHours, cardCount, solo, search, stem: stemmer, expansions, blocked })
    : null), [model, t, windowHours, cardCount, solo, search, expansions, blocked]);

  const scrubTo = useCallback((ms) => {
    setPlaying(false);
    setPosition(ms);
  }, []);

  const toggleSolo = useCallback((key) => {
    setSolo((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((name) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      writeCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (solo.size === 0) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSolo(new Set());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [solo]);

  if (loadState.status === 'loading') {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <p role="status" className="mx-auto max-w-6xl text-gray-400">Loading the news…</p>
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-6xl space-y-3">
          <p role="alert" className="text-red-400">The Observation Window couldn’t load.</p>
          <button type="button" className={buttonClass} onClick={() => {
            setLoadState({ status: 'loading' });
            setLoadRevision((n) => n + 1);
          }}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (model.items.length === 0) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-lg font-bold">Observation Window</h1>
          <p className="mt-2 text-gray-400">No news has been collected yet. Check back after the next hourly collection.</p>
        </div>
      </main>
    );
  }

  const lastRun = loadState.data.runs
    .map((run) => Date.parse(run.finishedAt ?? run.startedAt))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => b - a)[0];
  const play = () => {
    if (isPlaying) {
      setPlaying(false);
      return;
    }
    if (t >= model.end - HOUR) setPosition(model.start);
    setPlaying(true);
  };
  const allClosed = collapsed.size >= model.groups.length
    && model.groups.every((g) => collapsed.has(g.name));
  const toggleAll = () => {
    const next = allClosed ? new Set() : new Set(model.groups.map((g) => g.name));
    writeCollapsed(next);
    setCollapsed(next);
  };
  const jump = (hit) => {
    if (hit) scrubTo(hit.ms);
  };
  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      jump(e.shiftKey ? view.prevHit : view.nextHit);
    } else if (e.key === 'Escape' && searchText) {
      e.stopPropagation(); // clear the search first; a second Esc clears solo
      setSearchText('');
    }
  };

  return (
    <main className="ow-root min-h-screen bg-gray-950 px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-lg font-bold">Observation Window</h1>
        <p className="mb-3 text-sm text-gray-400">
          {model.items.length} items from {model.feeds.length} sources, from {formatTime(model.start)}.
          {' '}Last collected {lastRun ? formatTime(lastRun) : 'never'}. Ranking is source order.
        </p>

        <input
          type="range"
          className="ow-slider"
          aria-label="Timeline scrubber"
          min={model.start}
          max={model.end}
          step={HOUR}
          value={t}
          onChange={(e) => scrubTo(Number(e.target.value))}
        />

        <div className="my-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="min-w-[190px] font-semibold tabular-nums">{view.live ? 'Live' : formatTime(t)}</span>
          <button type="button" className={accentButtonClass} onClick={() => scrubTo(model.end)}>Go live</button>
          <button type="button" className={buttonClass} onClick={play}>{isPlaying ? 'Pause' : 'Play'}</button>
          <button type="button" className={buttonClass} onClick={toggleAll}>{allClosed ? 'Expand all' : 'Collapse all'}</button>
          {view.soloing && (
            <button type="button" className={accentButtonClass} onClick={() => setSolo(new Set())}>Clear solo (Esc)</button>
          )}
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search titles and text"
            aria-label="Search titles and text"
            autoComplete="off"
            className="w-56 rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
          <label className="flex items-center gap-1.5 text-gray-400">
            <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Whole word
          </label>
          <span className="tabular-nums text-gray-400" aria-live="polite">{searchCountText(view)}</span>
          {view.searching && (
            <>
              <button type="button" className={buttonClass} aria-label="Previous match" title="Previous match (Shift+Enter in the search box)" disabled={!view.prevHit} onClick={() => jump(view.prevHit)}>‹</button>
              <button type="button" className={buttonClass} aria-label="Next match" title="Next match (Enter in the search box)" disabled={!view.nextHit} onClick={() => jump(view.nextHit)}>›</button>
            </>
          )}
          <label className="flex items-center gap-1.5 text-gray-400">
            Window
            <select className={buttonClass} value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))}>
              {WINDOW_OPTIONS.map((o) => <option key={o.hours} value={o.hours}>±{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-gray-400">
            Cards
            <select className={buttonClass} value={cardCount} onChange={(e) => setCardCount(Number(e.target.value))}>
              {CARD_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        <ObservationTimeline
          model={model}
          view={view}
          solo={solo}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onToggleSolo={toggleSolo}
          onJump={scrubTo}
        />

        {view.level > 0 && (
          <div className="mt-3 text-sm text-gray-400" data-testid="widened">
            Fewer than {MIN_CARDS} exact matches in this window, so the search widened to {LEVEL_NAMES[view.level]}.{' '}
            {view.chips.map((chip) => (
              <span
                key={chip.word}
                title={`${chip.kind === 'synonym' ? 'Synonym' : 'Broader term'} of “${chip.of}”, from WordNet`}
                className={`mb-0.5 mr-1 inline-flex items-center gap-0.5 rounded-full border border-indigo-400 py-px pl-2 pr-1 text-white ${chip.kind === 'synonym' ? 'border-dashed' : 'border-dotted'}`}
              >
                {chip.word}
                <button
                  type="button"
                  aria-label={`Stop searching “${chip.word}”`}
                  className="px-1 text-gray-400 hover:text-white"
                  onClick={() => setBlocked((prev) => new Set(prev).add(chip.word))}
                >
                  ✕
                </button>
              </span>
            ))}
            {view.level >= 2 && view.chips.length === 0 && 'No related terms found in your stored news. '}
            {blocked.size > 0 && (
              <button type="button" className="underline" onClick={() => setBlocked(new Set())}>Restore removed terms</button>
            )}
          </div>
        )}

        <ObservationCards model={model} view={view} search={search} />
      </div>
    </main>
  );
}
