import { defineFunction } from '@aws-amplify/backend';

export const adminMetrics = defineFunction({
  name: 'admin-metrics',
  resourceGroupName: 'data',
  timeoutSeconds: 15,
});
