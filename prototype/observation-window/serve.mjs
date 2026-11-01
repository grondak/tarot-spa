// Tiny local server for the throwaway scrubber. Serves index.html, the collected data, the stemmer,
// and /api/expand (WordNet synonyms and broader terms for widening a thin search). Nothing else.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWordNet } from './wordnet.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 5199);

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/feeds.json': ['feeds.json', 'application/json'],
  '/data/items.json': ['data/items.json', 'application/json'],
  '/data/runs.jsonl': ['data/runs.jsonl', 'text/plain; charset=utf-8'],
  '/vendor/stemmer.js': ['node_modules/stemmer/index.js', 'text/javascript; charset=utf-8'],
};

const started = Date.now();
const lookup = loadWordNet();
console.log(`WordNet loaded in ${Date.now() - started} ms`);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/expand') {
    const term = (url.searchParams.get('term') ?? '').trim().toLowerCase().slice(0, 40);
    const body = /^[a-z]+$/.test(term) ? lookup(term) : { term, synonyms: [], broader: [] };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    return;
  }
  const route = files[url.pathname];
  if (!route) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = await readFile(join(here, route[0]));
    res.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('missing file; has the collector run yet?');
  }
}).listen(port, '127.0.0.1', () => console.log(`Observation Window scrubber: http://127.0.0.1:${port}`));
