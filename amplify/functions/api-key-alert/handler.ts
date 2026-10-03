import { AppSyncClient, ListApiKeysCommand } from '@aws-sdk/client-appsync';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const DEFAULT_WARNING_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REDEPLOY_FIX = 'Run `npx ampx sandbox --once` (or deploy) to regenerate the API key.';

type CommandClient = {
  send(command: unknown): Promise<unknown>;
};

type ApiKey = {
  expires?: number;
};

type ListApiKeysResult = {
  apiKeys?: ApiKey[];
};

type Dependencies = {
  appsync: CommandClient;
  ses: CommandClient;
  apiId: string;
  fromEmail: string;
  cutoutEmail: string;
  warningWindowDays: number;
};

const defaultDependencies: Dependencies = {
  appsync: new AppSyncClient({}),
  ses: new SESv2Client({}),
  apiId: process.env.APPSYNC_API_ID ?? '',
  fromEmail: process.env.ACCESS_FROM_EMAIL ?? '',
  cutoutEmail: process.env.CUTOUT_EMAIL ?? '',
  warningWindowDays: parseWarningWindowDays(process.env.WARNING_WINDOW_DAYS),
};

export function parseWarningWindowDays(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_WARNING_WINDOW_DAYS;
}

function sendEmail(deps: Pick<Dependencies, 'ses' | 'fromEmail' | 'cutoutEmail'>, subject: string, body: string) {
  return deps.ses.send(new SendEmailCommand({
    FromEmailAddress: deps.fromEmail,
    Destination: { ToAddresses: [deps.cutoutEmail] },
    Content: {
      Simple: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
    },
  }));
}

export function createHandler(deps: Dependencies = defaultDependencies) {
  return async () => {
    if (!deps.apiId || !deps.fromEmail || !deps.cutoutEmail) {
      throw new Error('api-key-alert configuration is missing');
    }

    const result = await deps.appsync.send(
      new ListApiKeysCommand({ apiId: deps.apiId }),
    ) as ListApiKeysResult;
    const validExpirySeconds = (result.apiKeys ?? [])
      .map((key) => key.expires)
      .filter((expires): expires is number => typeof expires === 'number');

    if (validExpirySeconds.length === 0) {
      await sendEmail(
        deps,
        'tarot-spa API key alert: no active API key found',
        'No active AppSync API key with valid expiry metadata was found for tarot-spa. The checkInviteKey public '
          + `lookup and the admin revoke lookup will fail until a new key exists. ${REDEPLOY_FIX}`,
      );
      return;
    }

    const soonestExpiresSeconds = Math.min(...validExpirySeconds);
    const msRemaining = soonestExpiresSeconds * 1000 - Date.now();
    const daysRemaining = Math.ceil(msRemaining / MS_PER_DAY);

    if (daysRemaining < 0) {
      await sendEmail(
        deps,
        'tarot-spa API key alert: ALREADY EXPIRED',
        `The tarot-spa AppSync API key expired ${Math.abs(daysRemaining)} day(s) ago. The checkInviteKey public `
          + `lookup and the admin revoke lookup are failing right now. ${REDEPLOY_FIX}`,
      );
      return;
    }

    if (daysRemaining > deps.warningWindowDays) {
      return;
    }

    await sendEmail(
      deps,
      'tarot-spa API key alert: expiring soon',
      `The tarot-spa AppSync API key expires in ${daysRemaining} day(s). Once it expires, the checkInviteKey `
        + `public lookup and the admin revoke lookup will fail. ${REDEPLOY_FIX}`,
    );
  };
}

export const handler = createHandler();
