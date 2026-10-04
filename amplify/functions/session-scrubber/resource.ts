import { defineFunction } from '@aws-amplify/backend';

export const sessionScrubber = defineFunction({
  name: 'session-scrubber',
  resourceGroupName: 'data',
  timeoutSeconds: 60,
});
