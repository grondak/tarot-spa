import { defineFunction } from '@aws-amplify/backend';

export const usageCounter = defineFunction({
  name: 'usage-counter',
  resourceGroupName: 'data',
});
