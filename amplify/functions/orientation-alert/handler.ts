import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

type CommandClient = {
  send(command: unknown): Promise<unknown>;
};

type SnsEvent = {
  Records?: Array<{
    EventSource?: string;
    Sns?: {
      Message?: string;
    };
  }>;
};

type Dependencies = {
  ses: CommandClient;
  fromEmail: string;
  cutoutEmail: string;
};

type AlarmDetails = {
  alarmName: string;
  newState?: string;
  reason?: string;
  changedAt?: string;
};

const defaultDependencies: Dependencies = {
  ses: new SESv2Client({}),
  fromEmail: process.env.ACCESS_FROM_EMAIL ?? '',
  cutoutEmail: process.env.CUTOUT_EMAIL ?? '',
};

const SUBJECT_PREFIX = 'tarot-spa Orientation Guide pipeline alert';
const UNKNOWN_ALARM = 'unknown alarm';
const GUIDANCE = 'Check the CloudWatch alarm before deciding whether the Story 3.8 reconciliation runbook applies. Do not copy Session Context or Guide content into tickets or logs.';

function cleanField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
  return cleaned || undefined;
}

// Only named fields from a CloudWatch alarm notification are used; anything else in the
// SNS message is ignored so arbitrary payload text never reaches the email.
function parseAlarm(message: string | undefined): AlarmDetails {
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(message ?? '');
    if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
  } catch {
    // Not a CloudWatch alarm notification; fall through to the unknown-alarm copy.
  }
  return {
    alarmName: cleanField(parsed.AlarmName, 256) ?? UNKNOWN_ALARM,
    newState: cleanField(parsed.NewStateValue, 32),
    reason: cleanField(parsed.NewStateReason, 1024),
    changedAt: cleanField(parsed.StateChangeTime, 64),
  };
}

function body(alarm: AlarmDetails): string {
  const lines = [`Alarm: ${alarm.alarmName}`];
  if (alarm.newState) lines.push(`State: ${alarm.newState}`);
  if (alarm.changedAt) lines.push(`Changed at: ${alarm.changedAt}`);
  if (alarm.reason) lines.push(`Reason: ${alarm.reason}`);
  return [
    'A tarot-spa operational alarm fired.',
    '',
    ...lines,
    '',
    GUIDANCE,
  ].join('\n');
}

export function createHandler(deps: Dependencies = defaultDependencies) {
  return async (event: SnsEvent) => {
    if (!deps.fromEmail || !deps.cutoutEmail) {
      throw new Error('orientation-alert configuration is missing');
    }
    const records = event.Records ?? [];
    if (records.length === 0 || records.some((record) => record.EventSource !== 'aws:sns')) {
      throw new Error('orientation-alert requires an SNS event');
    }

    await Promise.all(records.map((record) => {
      const alarm = parseAlarm(record.Sns?.Message);
      return deps.ses.send(new SendEmailCommand({
        FromEmailAddress: deps.fromEmail,
        Destination: { ToAddresses: [deps.cutoutEmail] },
        Content: {
          Simple: {
            Subject: { Data: `${SUBJECT_PREFIX}: ${alarm.alarmName}` },
            Body: { Text: { Data: body(alarm) } },
          },
        },
      }));
    }));
  };
}

export const handler = createHandler();
