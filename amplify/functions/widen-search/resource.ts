import { defineFunction } from '@aws-amplify/backend';

// Widens a thin search with WordNet synonyms and broader terms (epic S4.x). Pure lookup in a
// bundled table: no tables, no network, and it never sees anything but the single word searched.
export const widenSearch = defineFunction({
  name: 'widen-search',
  resourceGroupName: 'data',
  memoryMB: 512,
  timeoutSeconds: 10,
});
