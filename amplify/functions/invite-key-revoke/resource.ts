import { defineFunction } from '@aws-amplify/backend';

export const inviteKeyRevoke = defineFunction({
  name: 'invite-key-revoke',
  resourceGroupName: 'data',
});
