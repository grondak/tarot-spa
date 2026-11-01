// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalLink, decodeEntities, parseFeed, stripTags } from './parse';

const FETCHED_AT = '2026-10-31T12:00:00.000Z';

const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;

describe('parseFeed', () => {
  it('reads an RSS 2.0 item', () => {
    const [item] = parseFeed(rss(`<item>
      <title>Fed cuts rates</title>
      <link>https://example.com/a?utm_source=rss</link>
      <description><![CDATA[<p>The <b>Federal Reserve</b> moved.</p>]]></description>
      <pubDate>Thu, 29 Oct 2026 14:30:00 GMT</pubDate>
    </item>`), FETCHED_AT);

    expect(item).toMatchObject({
      title: 'Fed cuts rates',
      link: 'https://example.com/a',
      summary: 'The Federal Reserve moved.',
      publishedAt: '2026-10-29T14:30:00.000Z',
      publishedAtEstimated: false,
    });
    expect(item.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('reads an Atom entry, choosing the alternate link', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>Hello</title>
      <link rel="self" href="https://example.com/self"/>
      <link rel="alternate" href="https://example.com/post"/>
      <updated>2026-10-30T08:00:00Z</updated>
      <summary>Short</summary>
    </entry></feed>`;
    const [item] = parseFeed(xml, FETCHED_AT);

    expect(item.link).toBe('https://example.com/post');
    expect(item.publishedAt).toBe('2026-10-30T08:00:00.000Z');
  });

  it('reads an RSS 1.0 (RDF) item with a dc:date', () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <item><title>Old style</title><link>https://example.com/rdf</link><dc:date>2026-10-28T10:00:00Z</dc:date></item>
    </rdf:RDF>`;
    const [item] = parseFeed(xml, FETCHED_AT);

    expect(item.publishedAt).toBe('2026-10-28T10:00:00.000Z');
  });

  it('dates an item with no usable date at the fetch time and says so', () => {
    const [item] = parseFeed(rss('<item><title>No date</title><link>https://example.com/n</link></item>'), FETCHED_AT);

    expect(item.publishedAt).toBe(FETCHED_AT);
    expect(item.publishedAtEstimated).toBe(true);
  });

  it('gives the same id to the same story however it was linked', () => {
    const [a] = parseFeed(rss('<item><title>One</title><link>https://example.com/s?utm_campaign=x#top</link></item>'), FETCHED_AT);
    const [b] = parseFeed(rss('<item><title>One again</title><link>https://example.com/s</link></item>'), FETCHED_AT);

    expect(a.id).toBe(b.id);
  });

  it('keeps no more than 400 characters of summary', () => {
    const long = 'word '.repeat(200);
    const [item] = parseFeed(rss(`<item><title>T</title><link>https://example.com/l</link><description>${long}</description></item>`), FETCHED_AT);

    expect(item.summary.length).toBeLessThanOrEqual(400);
  });

  it('decodes characters a feed encoded twice', () => {
    const [item] = parseFeed(rss('<item><title>Board&amp;#39;s minutes</title><link>https://example.com/b</link></item>'), FETCHED_AT);

    expect(item.title).toBe("Board's minutes");
  });

  it('throws when a document holds no items, so a moved feed is noticed', () => {
    expect(() => parseFeed(rss(''), FETCHED_AT)).toThrow('no items found in feed');
    expect(() => parseFeed('<html><body>Not found</body></html>', FETCHED_AT)).toThrow('no items found in feed');
  });
});

describe('text helpers', () => {
  it('canonicalLink drops tracking parameters and the fragment but keeps real ones', () => {
    expect(canonicalLink('https://example.com/p?id=7&utm_medium=x&ref=y#frag')).toBe('https://example.com/p?id=7');
    expect(canonicalLink('not a url')).toBe('not a url');
  });

  it('decodeEntities handles named, decimal and hex entities and leaves unknown ones alone', () => {
    expect(decodeEntities('Tom &amp; Jerry &#8217;s &#x2019; &bogus; &#0;')).toBe('Tom & Jerry ’s ’ &bogus; &#0;');
  });

  it('stripTags removes markup and collapses whitespace', () => {
    expect(stripTags('<p>One</p>\n\n<p>Two   <em>three</em></p>')).toBe('One Two three');
  });
});
