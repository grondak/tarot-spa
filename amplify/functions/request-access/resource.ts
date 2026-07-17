import { defineFunction, secret } from '@aws-amplify/backend';

export const requestAccess = defineFunction({
  name: 'request-access',
  resourceGroupName: 'data',
  environment: {
    ACCESS_FROM_EMAIL: secret('ACCESS_FROM_EMAIL'),
    CUTOUT_EMAIL: secret('CUTOUT_EMAIL'),
  },
});
