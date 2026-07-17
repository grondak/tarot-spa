import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

type RequestAccessEvent = { arguments: { name: string; email: string } };
type CommandClient = { send(command: unknown): Promise<unknown> };

type HandlerDependencies = {
  ses: CommandClient;
  fromEmail: string;
  cutoutEmail: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const defaultDependencies: HandlerDependencies = {
  ses: new SESv2Client({}),
  fromEmail: process.env.ACCESS_FROM_EMAIL ?? '',
  cutoutEmail: process.env.CUTOUT_EMAIL ?? '',
};

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async (event: RequestAccessEvent) => {
    const name = event.arguments.name.trim().slice(0, 200).replace(/[\r\n]+/g, ' ');
    const email = event.arguments.email.trim().slice(0, 320);

    if (!name || !EMAIL_PATTERN.test(email)) {
      throw new Error('invalid request-access submission');
    }
    if (!deps.fromEmail || !deps.cutoutEmail) {
      throw new Error('request-access email configuration is missing');
    }

    await deps.ses.send(new SendEmailCommand({
      FromEmailAddress: deps.fromEmail,
      Destination: { ToAddresses: [deps.cutoutEmail] },
      Content: {
        Simple: {
          Subject: { Data: 'tarot-spa access request' },
          Body: { Text: { Data: `Name: ${name}\nEmail: ${email}` } },
        },
      },
    }));

    return true;
  };
}

export const handler = createHandler();
