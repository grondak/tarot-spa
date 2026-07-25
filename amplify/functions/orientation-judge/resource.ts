import { defineFunction } from '@aws-amplify/backend';

export const orientationJudge = defineFunction({
  name: 'orientation-judge',
  resourceGroupName: 'data',
  timeoutSeconds: 60,
});
