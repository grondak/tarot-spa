import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

function dependencies() {
  return {
    ses: { send: vi.fn().mockResolvedValue({}) },
    fromEmail: 'sender@example.com',
    cutoutEmail: 'operator@example.com',
  };
}

function alarmRecord(message: unknown) {
  return {
    EventSource: 'aws:sns',
    Sns: { Message: typeof message === 'string' ? message : JSON.stringify(message) },
  };
}

describe('orientation-alert handler', () => {
  it('names the alarm that fired in the subject and body', async () => {
    const deps = dependencies();

    await createHandler(deps)({
      Records: [alarmRecord({
        AlarmName: 'amplify-tarotspa-OrientationJudgeFailureAlarm-ABC123',
        NewStateValue: 'ALARM',
        NewStateReason: 'Threshold Crossed: 1 datapoint [2.0] was greater than or equal to the threshold (1.0).',
        StateChangeTime: '2026-11-14T20:40:00.000+0000',
        Trigger: { MetricName: 'Errors' },
      })],
    });

    expect(deps.ses.send).toHaveBeenCalledOnce();
    const input = deps.ses.send.mock.calls[0][0].input;
    expect(input).toMatchObject({
      FromEmailAddress: 'sender@example.com',
      Destination: { ToAddresses: ['operator@example.com'] },
      Content: {
        Simple: {
          Subject: {
            Data: 'tarot-spa Orientation Guide pipeline alert: amplify-tarotspa-OrientationJudgeFailureAlarm-ABC123',
          },
        },
      },
    });
    expect(input.Content.Simple.Body.Text.Data).toBe([
      'A tarot-spa operational alarm fired.',
      '',
      'Alarm: amplify-tarotspa-OrientationJudgeFailureAlarm-ABC123',
      'State: ALARM',
      'Changed at: 2026-11-14T20:40:00.000+0000',
      'Reason: Threshold Crossed: 1 datapoint [2.0] was greater than or equal to the threshold (1.0).',
      '',
      'Check the CloudWatch alarm before deciding whether the Story 3.8 reconciliation runbook applies. Do not copy Session Context or Guide content into tickets or logs.',
    ].join('\n'));
  });

  it('sends one email per record, each naming its own alarm', async () => {
    const deps = dependencies();

    await createHandler(deps)({
      Records: [
        alarmRecord({ AlarmName: 'WorkerAlarm' }),
        alarmRecord({ AlarmName: 'FeedAlarm' }),
      ],
    });

    const subjects = deps.ses.send.mock.calls.map((call) => call[0].input.Content.Simple.Subject.Data);
    expect(subjects).toEqual([
      'tarot-spa Orientation Guide pipeline alert: WorkerAlarm',
      'tarot-spa Orientation Guide pipeline alert: FeedAlarm',
    ]);
  });

  it('falls back to an unknown alarm without echoing a non-alarm message', async () => {
    const deps = dependencies();
    const sensitiveSessionContent = 'PRIVATE_CONTEXT_AND_GUIDE_SENTINEL';

    await createHandler(deps)({
      Records: [
        alarmRecord(sensitiveSessionContent),
        alarmRecord({ Note: sensitiveSessionContent }),
        { EventSource: 'aws:sns' },
      ],
    });

    expect(deps.ses.send).toHaveBeenCalledTimes(3);
    for (const [command] of deps.ses.send.mock.calls) {
      const input = command.input;
      expect(input.Content.Simple.Subject.Data).toBe('tarot-spa Orientation Guide pipeline alert: unknown alarm');
      expect(input.Content.Simple.Body.Text.Data).toContain('Alarm: unknown alarm');
      expect(JSON.stringify(input)).not.toContain(sensitiveSessionContent);
    }
  });

  it('keeps the subject on one line and bounds field length', async () => {
    const deps = dependencies();

    await createHandler(deps)({
      Records: [alarmRecord({ AlarmName: `Bad\r\nName${'x'.repeat(400)}` })],
    });

    const subject = deps.ses.send.mock.calls[0][0].input.Content.Simple.Subject.Data;
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual('tarot-spa Orientation Guide pipeline alert: '.length + 256);
  });

  it('propagates SES delivery failures for retry and dead-letter handling', async () => {
    const deps = dependencies();
    deps.ses.send.mockRejectedValueOnce(new Error('SES unavailable'));

    await expect(createHandler(deps)({ Records: [{ EventSource: 'aws:sns' }] }))
      .rejects.toThrow('SES unavailable');

    expect(deps.ses.send).toHaveBeenCalledOnce();
  });

  it('rejects missing configuration and non-SNS invocation before sending', async () => {
    const missing = dependencies();
    missing.cutoutEmail = '';
    await expect(createHandler(missing)({ Records: [{ EventSource: 'aws:sns' }] }))
      .rejects.toThrow('orientation-alert configuration is missing');
    expect(missing.ses.send).not.toHaveBeenCalled();

    const wrongSource = dependencies();
    await expect(createHandler(wrongSource)({ Records: [{ EventSource: 'aws:events' }] }))
      .rejects.toThrow('orientation-alert requires an SNS event');
    expect(wrongSource.ses.send).not.toHaveBeenCalled();
  });
});
