import { defineFunction, secret } from '@aws-amplify/backend';

export const apiKeyAlert = defineFunction({
  name: 'api-key-alert',
  resourceGroupName: 'data',
  timeoutSeconds: 30,
  environment: {
    ACCESS_FROM_EMAIL: secret('ACCESS_FROM_EMAIL'),
    CUTOUT_EMAIL: secret('CUTOUT_EMAIL'),
  },
});
