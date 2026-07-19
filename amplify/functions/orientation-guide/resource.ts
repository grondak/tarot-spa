import { defineFunction, secret } from '@aws-amplify/backend';

export const orientationGuide = defineFunction({
  name: 'orientation-guide',
  resourceGroupName: 'data',
  timeoutSeconds: 60,
  environment: {
    TAVILY_API_KEY: secret('TAVILY_API_KEY'),
  },
});
