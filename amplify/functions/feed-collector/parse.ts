import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

export type ParsedItem = {
  // Stable hash of the canonical link (the guid when there is no link), so the same story
  // arriving from two feeds, or from two runs, is one row.
  id: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string;
  // True when the feed gave no usable date and publishedAt is the fetch time instead.
  publishedAtEstimated: boolean;
};

type Raw = Record<string, unknown>;

const SUMMARY_MAX_CHARACTERS = 400;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
});

const asArray = (value: unknown): unknown[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

// RSS and Atom fields can be plain strings, objects with attributes, or objects with #text.
const text = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return text((value as Raw)['#text']);
  return String(value).trim();
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

// Some feeds double-encode (an apostrophe arrives as &#39; after the XML parser has already
// decoded once). Decode what is left so stored text is plain.
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1].toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function linkOf(item: Raw): string {
  const { link } = item;
  if (typeof link === 'string') return link.trim();
  const links = asArray(link) as unknown[];
  const alternate = links.find((l) => typeof l === 'object' && l !== null && ((l as Raw)['@_rel'] ?? 'alternate') === 'alternate');
  const chosen = alternate ?? links[0];
  if (!chosen) return '';
  if (typeof chosen === 'object') return String((chosen as Raw)['@_href'] ?? text(chosen)).trim();
  return String(chosen).trim();
}

const TRACKING_PARAMETERS = new Set(['ref', 'rss', 'cmpid', 'taid']);

// Drop tracking parameters and the fragment so the same story is one id however it was linked.
export function canonicalLink(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || TRACKING_PARAMETERS.has(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function normalize(item: Raw, fetchedAt: string): ParsedItem | null {
  const link = canonicalLink(linkOf(item));
  const guid = text(item.guid) || text(item.id) || link;
  const title = stripTags(text(item.title));
  if (!title && !link) return null;
  const key = link || guid;
  if (!key) return null;
  const published = parseDate(text(item.pubDate))
    ?? parseDate(text(item.published))
    ?? parseDate(text(item.updated))
    ?? parseDate(text(item['dc:date']));
  const summary = stripTags(
    text(item.description) || text(item.summary) || text(item['content:encoded']) || text(item.content),
  ).slice(0, SUMMARY_MAX_CHARACTERS);
  return {
    id: createHash('sha256').update(key).digest('hex').slice(0, 32),
    title,
    link,
    summary,
    publishedAt: published ?? fetchedAt,
    publishedAtEstimated: published === null,
  };
}

// Parses RSS 2.0, Atom and RSS 1.0 (RDF). Throws when the document holds no items, so a feed
// that has moved or started returning an error page is reported rather than silently empty.
export function parseFeed(xml: string, fetchedAt: string): ParsedItem[] {
  const doc = parser.parse(xml) as Raw;
  const rss = doc.rss as Raw | undefined;
  const feed = doc.feed as Raw | undefined;
  const rdf = doc['rdf:RDF'] as Raw | undefined;
  const channel = rss?.channel as Raw | undefined;
  const rawItems = asArray(channel?.item ?? feed?.entry ?? rdf?.item) as Raw[];
  if (rawItems.length === 0) throw new Error('no items found in feed');
  return rawItems.flatMap((raw) => {
    const item = normalize(raw, fetchedAt);
    return item ? [item] : [];
  });
}
