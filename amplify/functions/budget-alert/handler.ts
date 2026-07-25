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
      throw new Error('budget-alert configuration is missing');
    }
    const records = event.Records ?? [];
    if (records.length === 0 || records.some((record) => record.EventSource !== 'aws:sns')) {
      throw new Error('budget-alert requires an SNS event');
    }

    await Promise.all(records.map(() => deps.ses.send(new SendEmailCommand({
      FromEmailAddress: deps.fromEmail,
      Destination: { ToAddresses: [deps.cutoutEmail] },
      Content: {
        Simple: {
          Subject: { Data: 'tarot-spa monthly budget alert' },
          Body: {
            Text: {
              Data: 'The AWS Budgets tripwire for tarot-spa\'s aggregate monthly spend crossed its configured warning threshold. Check the AWS Budgets console for current spend-to-date against the ceiling. This is the secondary AWS-level safety net (AD-6) — the primary control is the in-app MonthlySpend reservation, which independently blocks new Orientation Guide requests once the app-tracked ceiling is reached.',
            },
          },
        },
      },
    }))));
  };
}

export const handler = createHandler();
