import { defineFunction } from '@aws-amplify/backend';

export const startOrientationGuide = defineFunction({
  name: 'start-orientation-guide',
  resourceGroupName: 'data',
  timeoutSeconds: 10,
});
