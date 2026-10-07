import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';

export const auth = defineAuth({
  loginWith: { email: true },
  groups: ['Admin'],
  triggers: { postConfirmation },
  // SES sending (senders.email) is live on staging but deliberately held back here:
  // Cognito's own identity-verification check for THIS pool has failed deploy six times
  // with "Email address is not verified" for an SES identity that is, in fact, fully
  // verified (confirmed via direct SES send + staging's identical, stable config) —
  // an AWS-side quirk isolated to this specific pool, open with AWS Support. Re-add the
  // senders block (see staging's resource.ts / git history) once that's resolved.
});
