import { defineFunction, secret } from '@aws-amplify/backend';

export const orientationGuide = defineFunction({
  name: 'orientation-guide',
  resourceGroupName: 'data',
  timeoutSeconds: 60,
  durableConfig: {
    executionTimeoutSeconds: 300,
    retentionPeriodDays: 1,
  },
  environment: {
    TAVILY_API_KEY: secret('TAVILY_API_KEY'),
  },
});
