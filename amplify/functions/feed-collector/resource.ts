import { defineFunction } from '@aws-amplify/backend';

// Fetches the starter feeds on a schedule so history builds while nobody is looking
// (epic S9.1). Lives in the data stack, like session-scrubber, because it only touches data tables.
export const feedCollector = defineFunction({
  name: 'feed-collector',
  resourceGroupName: 'data',
  timeoutSeconds: 120,
});
