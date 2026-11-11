import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as realApi from './cases';

export const defaultCasesApi = realApi;

// The user's cases and cycle timestamps. A failed action leaves the list as it was and says so.
export function useCases(api = defaultCasesApi) {
  const [state, setState] = useState({ status: 'loading', cases: [], events: [], tags: [] });
  const [activeId, setActiveId] = useState(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let active = true;
    api.loadCases()
      .then((data) => {
        if (active) setState({ status: 'ready', cases: data.cases, events: data.events, tags: data.tags ?? [] });
      })
      .catch(() => {
        if (active) setState({ status: 'error', cases: [], events: [], tags: [] });
      });
    return () => { active = false; };
  }, [api, revision]);

  const reload = () => {
    setState({ status: 'loading', cases: [], events: [], tags: [] });
    setRevision((n) => n + 1);
  };

  const openedAt = useCallback((id) => {
    const event = state.events.find((e) => e.caseId === id && e.kind === 'OPENED');
    return event ? Date.parse(event.at) : 0;
  }, [state.events]);

  const openCases = useMemo(
    () => state.cases.filter((c) => c.status !== 'CLOSED').sort((a, b) => openedAt(b.id) - openedAt(a.id)),
    [state.cases, openedAt],
  );
  const closedCases = useMemo(
    () => state.cases.filter((c) => c.status === 'CLOSED').sort((a, b) => openedAt(b.id) - openedAt(a.id)),
    [state.cases, openedAt],
  );
  const activeCase = openCases.find((c) => c.id === activeId) ?? openCases[0] ?? null;

  const attempt = async (work) => {
    setFailed(false);
    try {
      return await work();
    } catch {
      if (mounted.current) setFailed(true);
      return undefined;
    }
  };
  const addEvent = (caseId, kind) => setState((s) => ({
    ...s, events: [...s.events, { caseId, kind, at: new Date().toISOString() }],
  }));
  const replace = (updated) => setState((s) => ({ ...s, cases: s.cases.map((c) => (c.id === updated.id ? updated : c)) }));

  return {
    status: state.status,
    failed,
    openCases,
    closedCases,
    activeCase,
    events: state.events,
    tags: state.tags,
    reload,
    suggestRival: (input) => api.suggestRival(input),
    select: setActiveId,
    open: (input) => attempt(async () => {
      const made = await api.openCase(input);
      setState((s) => ({ ...s, cases: [...s.cases, made] }));
      addEvent(made.id, 'OPENED');
      setActiveId(made.id);
      return made;
    }),
    saveText: (id, input) => attempt(async () => {
      replace(await api.saveCaseText(id, input));
      return true;
    }),
    close: (id) => attempt(async () => {
      replace(await api.setCaseStatus(id, 'CLOSED'));
      addEvent(id, 'CLOSED');
    }),
    reopen: (id) => attempt(async () => {
      replace(await api.setCaseStatus(id, 'OPEN'));
      addEvent(id, 'REOPENED');
      setActiveId(id);
    }),
    remove: (id) => attempt(async () => {
      await api.deleteCase(id);
      setState((s) => ({
        ...s,
        cases: s.cases.filter((c) => c.id !== id),
        events: s.events.filter((e) => e.caseId !== id),
        tags: s.tags.filter((t) => t.caseId !== id),
      }));
    }),
    removeAll: () => attempt(async () => {
      await api.deleteAllCases();
      setState((s) => ({ ...s, cases: [], events: [], tags: [] }));
    }),
    tagItem: (caseId, item, stance) => attempt(async () => {
      const exists = state.tags.some((t) => t.caseId === caseId && t.itemId === item.id);
      const saved = await api.setTag({ caseId, itemId: item.id, itemAt: new Date(item.ms).toISOString(), stance }, exists);
      setState((s) => ({
        ...s,
        tags: [...s.tags.filter((t) => !(t.caseId === caseId && t.itemId === item.id)), saved],
      }));
    }),
    untagItem: (caseId, itemId) => attempt(async () => {
      await api.clearTag(caseId, itemId);
      setState((s) => ({ ...s, tags: s.tags.filter((t) => !(t.caseId === caseId && t.itemId === itemId)) }));
    }),
    // Best effort: measuring the cycle never stands in the way of the handoff itself.
    handedOff: (id) => {
      api.recordHandoff(id).then(() => {
        if (mounted.current) addEvent(id, 'HANDED_OFF');
      }).catch(() => {});
    },
  };
}
