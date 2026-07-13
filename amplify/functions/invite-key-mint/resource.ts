import { defineFunction } from '@aws-amplify/backend';

export const inviteKeyMint = defineFunction({
  name: 'invite-key-mint',
  resourceGroupName: 'data',
});
