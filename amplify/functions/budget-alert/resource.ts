import { defineFunction, secret } from '@aws-amplify/backend';

export const budgetAlert = defineFunction({
  name: 'budget-alert',
  resourceGroupName: 'data',
  timeoutSeconds: 10,
  environment: {
    ACCESS_FROM_EMAIL: secret('ACCESS_FROM_EMAIL'),
    CUTOUT_EMAIL: secret('CUTOUT_EMAIL'),
  },
});
