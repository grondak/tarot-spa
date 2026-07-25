import { defineFunction } from '@aws-amplify/backend';

export const orientationReconciler = defineFunction({
  name: 'orientation-reconciler',
  resourceGroupName: 'data',
  timeoutSeconds: 60,
});
