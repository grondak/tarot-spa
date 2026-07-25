import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

type CommandClient = {
  send(command: unknown): Promise<unknown>;
};

type SnsEvent = {
  Records?: Array<{
    EventSource?: string;
  }>;
};

type Dependencies = {
  ses: CommandClient;
  fromEmail: string;
  cutoutEmail: string;
};

const defaultDependencies: Dependencies = {
  ses: new SESv2Client({}),
  fromEmail: process.env.ACCESS_FROM_EMAIL ?? '',
  cutoutEmail: process.env.CUTOUT_EMAIL ?? '',
};

export function createHandler(deps: Dependencies = defaultDependencies) {
  return async (event: SnsEvent) => {
    if (!deps.fromEmail || !deps.cutoutEmail) {
      throw new Error('orientation-alert configuration is missing');
    }
    const records = event.Records ?? [];
    if (records.length === 0 || records.some((record) => record.EventSource !== 'aws:sns')) {
      throw new Error('orientation-alert requires an SNS event');
    }

    await Promise.all(records.map(() => deps.ses.send(new SendEmailCommand({
      FromEmailAddress: deps.fromEmail,
      Destination: { ToAddresses: [deps.cutoutEmail] },
      Content: {
        Simple: {
          Subject: { Data: 'tarot-spa Orientation Guide worker alert' },
          Body: {
            Text: {
              Data: 'An Orientation Guide pipeline alarm fired (worker or judge). Check the CloudWatch alarm before deciding whether the Story 3.8 reconciliation runbook applies. Do not copy Session Context or Guide content into tickets or logs.',
            },
          },
        },
      },
    }))));
  };
}

export const handler = createHandler();
