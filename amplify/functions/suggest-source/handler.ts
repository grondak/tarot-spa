import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

type SuggestSourceEvent = { arguments: { suggestion: string; contact?: string | null } };
type CommandClient = { send(command: unknown): Promise<unknown> };

type HandlerDependencies = {
  ses: CommandClient;
  fromEmail: string;
  cutoutEmail: string;
};

const MAX_SUGGESTION = 1000;
const MAX_CONTACT = 200;

const defaultDependencies: HandlerDependencies = {
  ses: new SESv2Client({}),
  fromEmail: process.env.ACCESS_FROM_EMAIL ?? '',
  cutoutEmail: process.env.CUTOUT_EMAIL ?? '',
};

// One line each, so a pasted newline cannot add a fake field to the email body.
const oneLine = (value: string | null | undefined, max: number) => (value ?? '')
  .trim()
  .slice(0, max)
  .replace(/\s+/g, ' ');

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async (event: SuggestSourceEvent) => {
    const suggestion = oneLine(event.arguments.suggestion, MAX_SUGGESTION);
    const contact = oneLine(event.arguments.contact, MAX_CONTACT);

    if (!suggestion) throw new Error('invalid source suggestion');
    if (!deps.fromEmail || !deps.cutoutEmail) {
      throw new Error('suggest-source email configuration is missing');
    }

    // Sent as is and not stored. Nothing about the sender is added: the contact line is whatever
    // they chose to type, and is optional.
    await deps.ses.send(new SendEmailCommand({
      FromEmailAddress: deps.fromEmail,
      Destination: { ToAddresses: [deps.cutoutEmail] },
      Content: {
        Simple: {
          Subject: { Data: 'tarot-spa source suggestion' },
          Body: { Text: { Data: `Suggestion: ${suggestion}\nContact: ${contact || '(none given)'}` } },
        },
      },
    }));

    return true;
  };
}

export const handler = createHandler();
