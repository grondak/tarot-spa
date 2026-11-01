// The Observation Window's fixed starter list. Order is the ranking until stakes exist
// (epic S2.8): earlier feeds rank first in the cards, and a group's position is the
// position of its first feed. The collector upserts these into the Feed table on every
// run, so editing this list and deploying is how the list changes.
//
// Fierce Network and RCR Wireless were dropped on 2026-10-31: both answer HTTP 403 to requests from
// AWS (they work from a home connection), so the cloud collector could not read them. Mobile World
// Live and Broadband Breakfast replaced them, after a test run showed AWS can fetch both.

export type FeedDefinition = {
  id: string;
  name: string;
  group: string;
  url: string;
  // Only on the outside-interest pool: one line saying why the Window shows it, which appears
  // beside every injected item (epic S2.4).
  reason?: string;
};

export const STARTER_FEEDS: readonly FeedDefinition[] = [
  { id: 'bbc-business', group: 'global economy', name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'economist-finance', group: 'global economy', name: 'The Economist: Finance & Economics', url: 'https://www.economist.com/finance-and-economics/rss.xml' },
  { id: 'fed-press', group: 'us economy', name: 'Federal Reserve press releases', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { id: 'cnbc-economy', group: 'us economy', name: 'CNBC Economy', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258' },
  { id: 'bbc-world', group: 'war', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'aljazeera', group: 'war', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'war-on-the-rocks', group: 'war', name: 'War on the Rocks', url: 'https://warontherocks.com/feed/' },
  { id: 'defense-news', group: 'war', name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml' },
  { id: 'slashdot', group: 'news for nerds', name: 'Slashdot', url: 'http://rss.slashdot.org/Slashdot/slashdotMain' },
  { id: 'hacker-news', group: 'news for nerds', name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { id: 'ars-technica', group: 'news for nerds', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'fortune', group: 'big-company successes', name: 'Fortune', url: 'https://fortune.com/feed/' },
  { id: 'forbes-business', group: 'big-company successes', name: 'Forbes Business', url: 'https://www.forbes.com/business/feed/' },
  { id: 'light-reading', group: 'telecom', name: 'Light Reading', url: 'https://www.lightreading.com/rss.xml' },
  { id: 'mobile-world-live', group: 'telecom', name: 'Mobile World Live', url: 'https://www.mobileworldlive.com/feed/' },
  { id: 'broadband-breakfast', group: 'telecom', name: 'Broadband Breakfast', url: 'https://broadbandbreakfast.com/feed/' },
  { id: 'huggingface-blog', group: 'ai development', name: 'Hugging Face blog', url: 'https://huggingface.co/blog/feed.xml' },
  { id: 'import-ai', group: 'ai development', name: 'Import AI', url: 'https://importai.substack.com/feed' },
  { id: 'openai-news', group: 'ai development', name: 'OpenAI news', url: 'https://openai.com/news/rss.xml' },
  { id: 'simon-willison', group: 'ai development', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
];

// The curated pool for outside-interest injection (epic S2.3): sources far from the starter
// interests, collected like any other feed but shown to each user only as a daily pick, so the
// Window does not close into a bubble. Edit this list and deploy to change the pool. The pool is
// ranked after the starter list.
export const OUTSIDE_FEED_POOL: readonly FeedDefinition[] = [
  { id: 'nature', group: 'outside interests', name: 'Nature', url: 'https://www.nature.com/nature.rss', reason: 'Peer-reviewed science, far from business and tech news.' },
  { id: 'quanta', group: 'outside interests', name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/', reason: 'Mathematics and physics written for curious outsiders.' },
  { id: 'atlas-obscura', group: 'outside interests', name: 'Atlas Obscura', url: 'https://www.atlasobscura.com/feeds/latest', reason: 'Odd places and local culture, the opposite of headline news.' },
  { id: 'nasa', group: 'outside interests', name: 'NASA', url: 'https://www.nasa.gov/feed/', reason: 'Space and Earth science from the people doing it.' },
  { id: 'smithsonian', group: 'outside interests', name: 'Smithsonian Magazine', url: 'https://www.smithsonianmag.com/rss/latest_articles/', reason: 'History, arts and natural history for a longer view.' },
  { id: 'aeon', group: 'outside interests', name: 'Aeon', url: 'https://aeon.co/feed.rss', reason: 'Essays on ideas and philosophy that the news cycle skips.' },
  { id: 'the-conversation', group: 'outside interests', name: 'The Conversation', url: 'https://theconversation.com/us/articles.atom', reason: 'Researchers explaining their own subjects, across every field.' },
];

// Everything the collector fetches, starter list first. Position in this list is the Feed table's
// sortOrder, so the pool ranks after the starter list.
export const COLLECTED_FEEDS: readonly FeedDefinition[] = [...STARTER_FEEDS, ...OUTSIDE_FEED_POOL];

export const isPoolFeed = (feed: FeedDefinition) => OUTSIDE_FEED_POOL.some((p) => p.id === feed.id);
