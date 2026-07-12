import { defineFunction } from '@aws-amplify/backend';

export const checkInviteKey = defineFunction({
  name: 'check-invite-key',
  resourceGroupName: 'data',
  environment: { INVITE_KEY_TABLE_NAME: '' },
});
