// The Observation Window's fixed starter list. Order is the ranking until stakes exist
// (epic S2.8): earlier feeds rank first in the cards, and a group's position is the
// position of its first feed. The collector upserts these into the Feed table on every
// run, so editing this list and deploying is how the list changes.

export type FeedDefinition = {
  id: string;
  name: string;
  group: string;
  url: string;
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
  { id: 'fierce-network', group: 'telecom', name: 'Fierce Network', url: 'https://www.fierce-network.com/rss/xml' },
  { id: 'rcr-wireless', group: 'telecom', name: 'RCR Wireless', url: 'https://www.rcrwireless.com/feed' },
  { id: 'huggingface-blog', group: 'ai development', name: 'Hugging Face blog', url: 'https://huggingface.co/blog/feed.xml' },
  { id: 'import-ai', group: 'ai development', name: 'Import AI', url: 'https://importai.substack.com/feed' },
  { id: 'openai-news', group: 'ai development', name: 'OpenAI news', url: 'https://openai.com/news/rss.xml' },
  { id: 'simon-willison', group: 'ai development', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
  { id: 'atlas-obscura', group: 'outside interests', name: 'Atlas Obscura', url: 'https://www.atlasobscura.com/feeds/latest' },
  { id: 'nature', group: 'outside interests', name: 'Nature', url: 'https://www.nature.com/nature.rss' },
  { id: 'quanta', group: 'outside interests', name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/' },
];
