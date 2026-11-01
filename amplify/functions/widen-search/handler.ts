import table from './wordnet-table.json';

type WordNetTable = { words: string[]; entries: Record<string, [number[], number[]]> };
type WidenSearchEvent = { arguments?: { term?: string } };
type Widened = { term: string; synonyms: string[]; broader: string[] };

type HandlerDependencies = { table: WordNetTable };

const MAX_TERM_LENGTH = 40;

// Same word-form guesses as prototype/observation-window/wordnet.mjs, so a plural or -ing/-ed
// word finds its dictionary entry.
function lemmaCandidates(term: string): string[] {
  return [...new Set([
    term,
    term.replace(/ies$/, 'y'),
    term.replace(/(es|s)$/, ''),
    term.replace(/ing$/, ''),
    term.replace(/ing$/, 'e'),
    term.replace(/ed$/, ''),
    term.replace(/ed$/, 'e'),
  ])];
}

export function createHandler(deps: HandlerDependencies = { table: table as unknown as WordNetTable }) {
  const { words, entries } = deps.table;
  return async (event: WidenSearchEvent): Promise<Widened> => {
    const term = (event.arguments?.term ?? '').trim().toLowerCase().slice(0, MAX_TERM_LENGTH);
    if (!/^[a-z]+$/.test(term)) return { term, synonyms: [], broader: [] };

    const synonyms = new Set<string>();
    const broader = new Set<string>();
    for (const lemma of lemmaCandidates(term)) {
      const entry = Object.hasOwn(entries, lemma) ? entries[lemma] : undefined;
      if (!entry) continue;
      for (const id of entry[0]) synonyms.add(words[id]);
      for (const id of entry[1]) broader.add(words[id]);
    }
    synonyms.delete(term);
    return {
      term,
      synonyms: [...synonyms],
      broader: [...broader].filter((w) => w !== term && !synonyms.has(w)),
    };
  };
}

export const handler = createHandler();
