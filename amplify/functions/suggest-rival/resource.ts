import { defineFunction } from '@aws-amplify/backend';

// Offers one rival explanation for an open case (epic S4.6). One short model call on request;
// it keeps nothing, and has its own daily and monthly caps apart from the Guide's.
export const suggestRival = defineFunction({
  name: 'suggest-rival',
  resourceGroupName: 'data',
  timeoutSeconds: 40,
});
