import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

function dependencies() {
  return {
    ses: { send: vi.fn().mockResolvedValue({}) },
    fromEmail: 'sender@example.com',
    cutoutEmail: 'operator@example.com',
  };
}

describe('orientation-alert handler', () => {
  it('sends fixed operational copy for an SNS alarm without Session content', async () => {
    const deps = dependencies();
    const sensitiveSessionContent = 'PRIVATE_CONTEXT_AND_GUIDE_SENTINEL';

    await createHandler(deps)({
      Records: [{
        EventSource: 'aws:sns',
        ...({ Sns: { Message: sensitiveSessionContent } } as object),
      }],
    });

    expect(deps.ses.send).toHaveBeenCalledOnce();
    const input = deps.ses.send.mock.calls[0][0].input;
    expect(input).toMatchObject({
      FromEmailAddress: 'sender@example.com',
      Destination: { ToAddresses: ['operator@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'tarot-spa Orientation Guide worker alert' },
        },
      },
    });
    expect(input.Content.Simple.Body.Text.Data).toBe(
      'An Orientation Guide worker execution failed. Check the CloudWatch alarm and the Story 3.8 reconciliation runbook. Do not copy Session Context or Guide content into tickets or logs.',
    );
    expect(JSON.stringify(input)).not.toContain(sensitiveSessionContent);
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
