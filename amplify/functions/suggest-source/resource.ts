import { defineFunction, secret } from '@aws-amplify/backend';

// Emails a source suggestion from the Observation Window to the operator (route 1 of "how does a
// user submit their own topics"): the operator decides, and adds feeds in amplify/feeds.ts.
export const suggestSource = defineFunction({
  name: 'suggest-source',
  resourceGroupName: 'data',
  environment: {
    ACCESS_FROM_EMAIL: secret('ACCESS_FROM_EMAIL'),
    CUTOUT_EMAIL: secret('CUTOUT_EMAIL'),
  },
});
