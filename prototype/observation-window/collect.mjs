// Throwaway collector for the Observation Window Release 0 self-test.
// Fetches every feed in feeds.json, stores each item once, keeps 30 days of items,
// keeps a daily count per source after items expire, and logs every run so a
// collector outage can be told apart from a quiet day (S9.1, S9.3, S9.7, S9.9).
import { XMLParser } from 'fast-xml-parser';
import { mkdir, readFile, rename, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, 'data');
const RETENTION_DAYS = 30;
const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT = 'Mozilla/5.0 observation-window-prototype';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
});

const asArray = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

// RSS and Atom fields can be plain strings, objects with attributes, or objects with #text.
const text = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return text(value['#text'] ?? '');
  return String(value).trim();
};

const stripTags = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const linkOf = (item) => {
  const link = item.link;
  if (typeof link === 'string') return link.trim();
  const links = asArray(link);
  const alternate = links.find((l) => typeof l === 'object' && (l['@_rel'] ?? 'alternate') === 'alternate');
  const chosen = alternate ?? links[0];
  if (!chosen) return '';
  return typeof chosen === 'object' ? (chosen['@_href'] ?? text(chosen)) : String(chosen).trim();
};

// Drop tracking parameters so the same story from two feeds is stored once.
const canonicalLink = (raw) => {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || ['ref', 'rss', 'cmpid', 'taid'].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
};

const parseDate = (raw) => {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

const normalize = (item, fetchedAt) => {
  const link = canonicalLink(linkOf(item));
  const guid = text(item.guid) || text(item.id) || link;
  const title = stripTags(text(item.title));
  if (!title && !link) return null;
  const published =
    parseDate(text(item.pubDate)) ??
    parseDate(text(item.published)) ??
    parseDate(text(item.updated)) ??
    parseDate(text(item['dc:date']));
  const summary = stripTags(text(item.description) || text(item.summary) || text(item['content:encoded']) || text(item.content)).slice(0, 400);
  return {
    key: link || guid,
    title,
    link,
    summary,
    publishedAt: published ?? fetchedAt,
    publishedAtEstimated: published === null,
  };
};

const readJson = async (name, fallback) => {
  try {
    return JSON.parse(await readFile(join(dataDir, name), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
};

const writeJson = async (name, value) => {
  const target = join(dataDir, name);
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, target);
};

const fetchFeed = async (feed) => {
  const response = await fetch(feed.url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const doc = parser.parse(await response.text());
  const rawItems = asArray(doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item);
  if (rawItems.length === 0) throw new Error('no items found in feed');
  return rawItems;
};

const main = async () => {
  await mkdir(dataDir, { recursive: true });
  const feeds = JSON.parse(await readFile(join(here, 'feeds.json'), 'utf8'));
  const items = await readJson('items.json', {});
  const counts = await readJson('counts.json', {});
  const startedAt = new Date().toISOString();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const results = [];

  for (const feed of feeds) {
    const result = { feedId: feed.id, status: 'ok', seen: 0, added: 0 };
    try {
      const fetchedAt = new Date().toISOString();
      const rawItems = await fetchFeed(feed);
      for (const raw of rawItems) {
        const item = normalize(raw, fetchedAt);
        if (!item) continue;
        result.seen += 1;
        if (Date.parse(item.publishedAt) < cutoff) continue;
        const existing = items[item.key];
        if (existing) {
          if (!existing.sources.includes(feed.id)) existing.sources.push(feed.id);
          continue;
        }
        const { key, ...rest } = item;
        items[key] = { ...rest, sources: [feed.id], fetchedAt };
        result.added += 1;
        const day = item.publishedAt.slice(0, 10);
        counts[feed.id] ??= {};
        counts[feed.id][day] = (counts[feed.id][day] ?? 0) + 1;
      }
    } catch (error) {
      result.status = 'error';
      result.error = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
  }

  // Expire items past retention. Their daily counts were recorded when they were added.
  let expired = 0;
  for (const [key, item] of Object.entries(items)) {
    if (Date.parse(item.publishedAt) < cutoff) {
      delete items[key];
      expired += 1;
    }
  }

  await writeJson('items.json', items);
  await writeJson('counts.json', counts);
  await appendFile(
    join(dataDir, 'runs.jsonl'),
    `${JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), expired, results })}\n`,
  );

  const ok = results.filter((r) => r.status === 'ok').length;
  const added = results.reduce((sum, r) => sum + r.added, 0);
  console.log(`${startedAt}  feeds ok ${ok}/${results.length}  added ${added}  expired ${expired}  stored ${Object.keys(items).length}`);
  for (const r of results.filter((r) => r.status === 'error')) console.log(`  FAILED ${r.feedId}: ${r.error}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
