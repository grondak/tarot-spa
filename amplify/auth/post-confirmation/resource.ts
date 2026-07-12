import { defineFunction } from '@aws-amplify/backend';

// ACCOUNT_TABLE_PARAM / INVITE_KEY_TABLE_PARAM (SSM parameter paths, not table names) are
// added in backend.ts, where the per-environment path prefix is known.
export const postConfirmation = defineFunction({
  name: 'redeem-invite-key',
  resourceGroupName: 'auth',
});
