import { defineFunction } from '@aws-amplify/backend';

export const adminLogs = defineFunction({
  name: 'admin-logs',
  resourceGroupName: 'data',
  timeoutSeconds: 15,
});
