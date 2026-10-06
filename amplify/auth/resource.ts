import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';

export const auth = defineAuth({
  loginWith: { email: true },
  groups: ['Admin'],
  triggers: { postConfirmation },
  // Cognito's default email sender (COGNITO_DEFAULT) gives no delivery/bounce visibility
  // and is prone to spam-filtering — verification emails have gone missing for real
  // invitees. oodadss.com is SES-verified (DKIM) and the account has SES production access.
  senders: {
    email: {
      fromEmail: 'no-reply@oodadss.com',
      fromName: 'Systems Thinking Tarot',
    },
  },
});
