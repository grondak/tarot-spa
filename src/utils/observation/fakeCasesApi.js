import { vi } from 'vitest';

// An in-memory stand-in for the owner-only tables.
export function fakeCasesApi({ cases = [], events = [] } = {}) {
  const db = { cases: [...cases], events: [...events], next: 1 };
  const now = () => new Date().toISOString();
  return {
    db,
    loadCases: vi.fn(async () => ({ cases: [...db.cases], events: [...db.events] })),
    openCase: vi.fn(async ({ title, hypothesis }) => {
      const made = { id: `c${db.next++}`, title, hypothesis, status: 'OPEN' };
      db.cases.push(made);
      db.events.push({ caseId: made.id, kind: 'OPENED', at: now() });
      return made;
    }),
    saveCaseText: vi.fn(async (id, { title, hypothesis }) => {
      const found = db.cases.find((c) => c.id === id);
      Object.assign(found, { title, hypothesis });
      return { ...found };
    }),
    setCaseStatus: vi.fn(async (id, status) => {
      const found = db.cases.find((c) => c.id === id);
      found.status = status;
      db.events.push({ caseId: id, kind: status === 'CLOSED' ? 'CLOSED' : 'REOPENED', at: now() });
      return { ...found };
    }),
    recordHandoff: vi.fn(async (id) => { db.events.push({ caseId: id, kind: 'HANDED_OFF', at: now() }); }),
    deleteCase: vi.fn(async (id) => {
      db.cases = db.cases.filter((c) => c.id !== id);
      db.events = db.events.filter((e) => e.caseId !== id);
    }),
    deleteAllCases: vi.fn(async () => { db.cases = []; db.events = []; }),
  };
}
