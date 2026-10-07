import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';

export const auth = defineAuth({
  loginWith: { email: true },
  groups: ['Admin'],
  triggers: { postConfirmation },
  // SES email sending is configured in backend.ts as an L1 CfnUserPool override, not here —
  // defineAuth's `senders.email` can only build the SES SourceArn from the full `fromEmail`
  // address (identity/no-reply@oodadss.com), and Cognito's own verification check rejected
  // that ARN shape as "not verified" on one pool while accepting it on another with the
  // identical SES identity. See backend.ts for the domain-identity-ARN fix and the full story.
});
