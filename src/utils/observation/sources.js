import { sourceKey } from './keys';

// A group is on, off, or partly on (some of its sources switched off).
export function groupState(group, disabled) {
  if (disabled.has(sourceKey.group(group.name))) return 'off';
  const off = group.feeds.filter((f) => disabled.has(sourceKey.feed(f.id))).length;
  if (group.feeds.length > 0 && off === group.feeds.length) return 'off';
  return off > 0 ? 'partial' : 'on';
}

// Which sources and groups are on is the user's own choice, remembered in this browser only.
// A group key switches the whole group (including sources added to it later); individual keys
// switch one source. Turning a source on inside a switched-off group turns the group's other
// sources individually off, so exactly that one comes back.
export function toggleGroup(catalog, disabled, name) {
  const next = new Set(disabled);
  const group = catalog.find((g) => g.name === name);
  const state = groupState(group, disabled);
  for (const feed of group.feeds) next.delete(sourceKey.feed(feed.id));
  if (state === 'off') next.delete(sourceKey.group(name));
  else next.add(sourceKey.group(name));
  return next;
}

export function toggleFeed(catalog, disabled, groupName, feedId) {
  const next = new Set(disabled);
  const group = catalog.find((g) => g.name === groupName);
  if (next.delete(sourceKey.group(groupName))) {
    for (const feed of group.feeds) if (feed.id !== feedId) next.add(sourceKey.feed(feed.id));
  } else if (!next.delete(sourceKey.feed(feedId))) {
    next.add(sourceKey.feed(feedId));
  }
  return next;
}
