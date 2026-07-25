import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

const SUBJECT = 'tarot-spa monthly budget alert';
const BODY = 'The AWS Budgets tripwire for tarot-spa\'s aggregate monthly spend crossed its configured warning threshold. Check the AWS Budgets console for current spend-to-date against the ceiling. This is the secondary AWS-level safety net (AD-6) — the primary control is the in-app MonthlySpend reservation, which independently blocks new Orientation Guide requests once the app-tracked ceiling is reached.';

function dependencies() {
  return {
    ses: { send: vi.fn().mockResolvedValue({}) },
    fromEmail: 'sender@example.com',
    cutoutEmail: 'operator@example.com',
  };
}

describe('budget-alert handler', () => {
  it('sends the exact fixed budget-alert copy for an SNS notification', async () => {
    const deps = dependencies();
    const rawBudgetMessage = 'story-3.6 raw SNS message sentinel';

    await createHandler(deps)({
      Records: [{
        EventSource: 'aws:sns',
        ...({ Sns: { Message: rawBudgetMessage } } as object),
      }],
    });

    expect(deps.ses.send).toHaveBeenCalledOnce();
    expect(deps.ses.send.mock.calls[0][0].input).toEqual({
      FromEmailAddress: 'sender@example.com',
      Destination: { ToAddresses: ['operator@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: SUBJECT },
          Body: { Text: { Data: BODY } },
        },
      },
    });
    expect(JSON.stringify(deps.ses.send.mock.calls[0][0].input)).not.toContain(rawBudgetMessage);
  });

  it('propagates SES delivery failures for retry and dead-letter handling', async () => {
    const deps = dependencies();
    deps.ses.send.mockRejectedValueOnce(new Error('SES unavailable'));

    await expect(createHandler(deps)({ Records: [{ EventSource: 'aws:sns' }] }))
      .rejects.toThrow('SES unavailable');

    expect(deps.ses.send).toHaveBeenCalledOnce();
  });

  it('rejects missing configuration and invalid SNS events before sending', async () => {
    const missing = dependencies();
    missing.cutoutEmail = '';
    await expect(createHandler(missing)({ Records: [{ EventSource: 'aws:sns' }] }))
      .rejects.toThrow('budget-alert configuration is missing');
    expect(missing.ses.send).not.toHaveBeenCalled();

    const wrongSource = dependencies();
    await expect(createHandler(wrongSource)({ Records: [{ EventSource: 'aws:events' }] }))
      .rejects.toThrow('budget-alert requires an SNS event');
    expect(wrongSource.ses.send).not.toHaveBeenCalled();

    const empty = dependencies();
    await expect(createHandler(empty)({ Records: [] }))
      .rejects.toThrow('budget-alert requires an SNS event');
    expect(empty.ses.send).not.toHaveBeenCalled();
  });
});
