import { vi } from 'vitest';

// An in-memory stand-in for the owner-only tables.
export function fakeCasesApi({ cases = [], events = [], tags = [], expected = [] } = {}) {
  const db = { cases: [...cases], events: [...events], tags: [...tags], expected: [...expected], next: 1 };
  const now = () => new Date().toISOString();
  return {
    db,
    loadCases: vi.fn(async () => ({
      cases: [...db.cases], events: [...db.events], tags: [...db.tags], expected: [...db.expected],
    })),
    createExpectedEvent: vi.fn(async (input) => {
      const made = { id: `x${db.next++}`, ...input };
      db.expected.push(made);
      return { ...made };
    }),
    deleteExpectedEvent: vi.fn(async (id) => { db.expected = db.expected.filter((e) => e.id !== id); }),
    openCase: vi.fn(async ({ title, hypothesis }) => {
      const made = { id: `c${db.next++}`, title, hypothesis, status: 'OPEN' };
      db.cases.push(made);
      db.events.push({ caseId: made.id, kind: 'OPENED', at: now() });
      return made;
    }),
    saveCaseText: vi.fn(async (id, { title, hypothesis, rivalHypothesis }) => {
      const found = db.cases.find((c) => c.id === id);
      Object.assign(found, { title, hypothesis, ...(rivalHypothesis !== undefined && { rivalHypothesis }) });
      return { ...found };
    }),
    setCaseStatus: vi.fn(async (id, status) => {
      const found = db.cases.find((c) => c.id === id);
      found.status = status;
      db.events.push({ caseId: id, kind: status === 'CLOSED' ? 'CLOSED' : 'REOPENED', at: now() });
      return { ...found };
    }),
    setTag: vi.fn(async (tag) => {
      db.tags = [...db.tags.filter((t) => !(t.caseId === tag.caseId && t.itemId === tag.itemId)), tag];
      return { ...tag };
    }),
    clearTag: vi.fn(async (caseId, itemId) => {
      db.tags = db.tags.filter((t) => !(t.caseId === caseId && t.itemId === itemId));
    }),
    suggestRival: vi.fn(async () => ({ rival: 'Imports, not demand, explain the shortage.', fits: [] })),
    recordHandoff: vi.fn(async (id) => { db.events.push({ caseId: id, kind: 'HANDED_OFF', at: now() }); }),
    deleteCase: vi.fn(async (id) => {
      db.cases = db.cases.filter((c) => c.id !== id);
      db.events = db.events.filter((e) => e.caseId !== id);
      db.tags = db.tags.filter((t) => t.caseId !== id);
      db.expected = db.expected.filter((e) => e.caseId !== id);
    }),
    deleteAllCases: vi.fn(async () => { db.cases = []; db.events = []; db.tags = []; db.expected = []; }),
  };
}
