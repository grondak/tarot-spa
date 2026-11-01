// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

const dependencies = () => ({
  ses: { send: vi.fn().mockResolvedValue({}) },
  fromEmail: 'access@example.test',
  cutoutEmail: 'cutout@example.test',
});
const event = (suggestion: string, contact?: string | null) => ({ arguments: { suggestion, contact } });

describe('suggest-source handler', () => {
  it.each(['', '   ', '\n\t'])('rejects an empty suggestion %j without sending email', async (text) => {
    const deps = dependencies();
    await expect(createHandler(deps)(event(text))).rejects.toThrow('invalid source suggestion');
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('fails clearly when the email addresses are not configured', async () => {
    const deps = { ...dependencies(), cutoutEmail: '' };
    await expect(createHandler(deps)(event('Something'))).rejects.toThrow('email configuration is missing');
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('sends one fixed-subject email to the cutout address', async () => {
    const deps = dependencies();
    await expect(createHandler(deps)(event(' https://example.com/feed ', ' me@example.com '))).resolves.toBe(true);

    expect(deps.ses.send).toHaveBeenCalledOnce();
    expect(deps.ses.send.mock.calls[0][0].input).toEqual({
      FromEmailAddress: 'access@example.test',
      Destination: { ToAddresses: ['cutout@example.test'] },
      Content: {
        Simple: {
          Subject: { Data: 'tarot-spa source suggestion' },
          Body: { Text: { Data: 'Suggestion: https://example.com/feed\nContact: me@example.com' } },
        },
      },
    });
  });

  it('says when no contact was given, including a null one', async () => {
    for (const contact of [undefined, null, '  ']) {
      const deps = dependencies();
      await createHandler(deps)(event('Sailing news', contact));
      expect(deps.ses.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data).toBe('Suggestion: Sailing news\nContact: (none given)');
    }
  });

  it('flattens newlines so the text cannot add fields to the email', async () => {
    const deps = dependencies();
    await createHandler(deps)(event('line one\nContact: attacker@example.com\r\nmore', 'a\nb'));
    const body = deps.ses.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data as string;
    expect(body.split('\n')).toHaveLength(2);
    expect(body).toContain('Suggestion: line one Contact: attacker@example.com more');
  });

  it('cuts overlong text', async () => {
    const deps = dependencies();
    await createHandler(deps)(event('x'.repeat(5000), 'c'.repeat(5000)));
    const body = deps.ses.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data as string;
    expect(body).toBe(`Suggestion: ${'x'.repeat(1000)}\nContact: ${'c'.repeat(200)}`);
  });
});
