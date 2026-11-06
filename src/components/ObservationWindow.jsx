import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stemmer } from 'stemmer';
import ObservationCards from './ObservationCards';
import ObservationCases from './ObservationCases';
import ObservationSources from './ObservationSources';
import ObservationTimeline from './ObservationTimeline';
import { defaultCasesApi, useCases } from '../utils/observation/useCases';
import { observedEvents } from '../utils/observation/handoff';
import { caseKeywords, relevantItems, tallyUpTo } from '../utils/observation/relevance';
import { loadObservationData, widenSearchTerm } from '../utils/observation/data';
import {
  COLLAPSED_KEY, DISABLED_KEY, DISMISSED_KEY, clearObservationPreferences, readSet, writeSet,
} from '../utils/observation/preferences';
import { LEVEL_NAMES, MIN_CARDS, parseSearch } from '../utils/observation/search';
import { HOUR, buildModel, formatTime } from '../utils/observation/timeline';
import {
  WINDOW_OPTIONS, computeView, expandableTerms, searchCountText,
} from '../utils/observation/view';

const CARD_COUNTS = [3, 6, 12, 24];
const PLAY_STEP_MS = 80;

const buttonClass = 'rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-sm text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40';
const accentButtonClass = `${buttonClass} !border-indigo-400 !text-indigo-300`;

const readCollapsed = () => readSet(COLLAPSED_KEY);
const writeCollapsed = (collapsed) => writeSet(COLLAPSED_KEY, collapsed);

export default function ObservationWindow({
  userId = null,
  suggestFn,
  onOrient,
  orientBlocked = false,
  casesApi = defaultCasesApi,
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
  const [dismissed, setDismissed] = useState(() => readSet(DISMISSED_KEY));
  const [disabled, setDisabled] = useState(() => readSet(DISABLED_KEY));
  const [forgotten, setForgotten] = useState(false);
  const cases = useCases(casesApi);
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
    ? buildModel({
      ...loadState.data, now: loadState.loadedAt, stem: stemmer, userId: userId ?? '', dismissed, disabled,
    })
    : null), [loadState, userId, dismissed, disabled]);
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

  // Items that look relevant to the open case, from the user's own words in it. Proposals only.
  const activeCase = cases.activeCase;
  const caseTagMap = useMemo(
    () => new Map(cases.tags.filter((tag) => tag.caseId === activeCase?.id).map((tag) => [tag.itemId, tag])),
    [cases.tags, activeCase?.id],
  );
  const caseMatches = useMemo(() => {
    if (!model || !activeCase) return new Map();
    return relevantItems(model.items, caseKeywords(`${activeCase.title} ${activeCase.hypothesis}`, { stem: stemmer, model }));
  }, [model, activeCase?.id, activeCase?.title, activeCase?.hypothesis]); // eslint-disable-line react-hooks/exhaustive-deps
  const tally = useMemo(
    () => (model && activeCase ? tallyUpTo(t, { tags: caseTagMap, matches: caseMatches, items: model.items }) : null),
    [model, activeCase, t, caseTagMap, caseMatches],
  );
  const tagging = activeCase ? {
    relevant: caseMatches,
    tags: caseTagMap,
    onTag: (item, stance) => cases.tagItem(activeCase.id, item, stance),
    onUntag: (item) => cases.untagItem(activeCase.id, item.id),
  } : null;

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

  const dismissSource = useCallback((feedId) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(feedId);
      writeSet(DISMISSED_KEY, next);
      return next;
    });
  }, []);

  const restoreSources = () => {
    writeSet(DISMISSED_KEY, []);
    setDismissed(new Set());
  };

  const changeDisabled = (next) => {
    writeSet(DISABLED_KEY, next);
    setDisabled(next);
  };

  const forgetChoices = () => {
    clearObservationPreferences();
    setCollapsed(new Set());
    setDismissed(new Set());
    setDisabled(new Set());
    setForgotten(true);
  };

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

  if (model.items.length === 0 && disabled.size > 0) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-lg font-bold">Observation Window</h1>
          <p className="mt-2 text-gray-400">Every source with news is switched off.</p>
          <ObservationSources catalog={model.catalog} disabled={disabled} onChange={changeDisabled} suggestFn={suggestFn} />
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

        <ObservationCases cases={cases} tally={tally} tallyAt={view.live ? 'now' : formatTime(t)} />

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
          {dismissed.size > 0 && (
            <button type="button" className={buttonClass} onClick={restoreSources}>
              Restore {dismissed.size} dismissed {dismissed.size === 1 ? 'source' : 'sources'}
            </button>
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

        <ObservationSources catalog={model.catalog} disabled={disabled} onChange={changeDisabled} suggestFn={suggestFn} />

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

        <ObservationCards
          model={model}
          view={view}
          search={search}
          onDismiss={dismissSource}
          orientBlocked={orientBlocked}
          tagging={tagging}
          onOrient={onOrient && ((items) => {
            if (activeCase) cases.handedOff(activeCase.id);
            onOrient(observedEvents(model, items), activeCase);
          })}
        />

        <footer className="mt-8 border-t border-gray-800 pt-4 text-sm text-gray-400">
          <p>
            The news here is shared by everyone and kept 30 days. Your cases, with the hypotheses you
            wrote, are stored on our servers, visible only to you, until you delete them, along with the
            times you opened, handed off and closed them and which items you tagged. Nothing else about what you look at is stored
            on our servers. The only other things remembered are your open and closed groups, the sources
            you switched off and the ones you dismissed, and only in this browser.
          </p>
          <button type="button" className={`mt-2 ${buttonClass}`} onClick={forgetChoices}>
            Forget my choices on this page
          </button>
          {forgotten && <span role="status" className="ml-3">Forgotten. This browser remembers nothing about this page now.</span>}
        </footer>
      </div>
    </main>
  );
}
