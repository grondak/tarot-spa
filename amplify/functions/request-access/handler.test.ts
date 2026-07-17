import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

const validEvent = { arguments: { name: ' Priya Shah ', email: ' priya@example.com ' } };

function dependencies() {
  return {
    ses: { send: vi.fn() },
    fromEmail: 'access@example.test',
    cutoutEmail: 'cutout@example.test',
  };
}

describe('request-access handler', () => {
  it.each([
    [{ arguments: { name: '   ', email: 'priya@example.com' } }],
    [{ arguments: { name: 'Priya Shah', email: 'not-an-email' } }],
  ])('rejects invalid submissions without sending email', async (event) => {
    const deps = dependencies();

    await expect(createHandler(deps)(event)).rejects.toThrow('invalid request-access submission');
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('fails clearly when the cutout address is not configured', async () => {
    const deps = dependencies();
    deps.cutoutEmail = '';

    await expect(createHandler(deps)(validEvent)).rejects.toThrow('email configuration is missing');
    expect(deps.ses.send).not.toHaveBeenCalled();
  });

  it('sends exactly one fixed-subject email to the cutout address', async () => {
    const deps = dependencies();
    deps.ses.send.mockResolvedValueOnce({});

    await expect(createHandler(deps)(validEvent)).resolves.toBe(true);

    expect(deps.ses.send).toHaveBeenCalledOnce();
    expect(deps.ses.send.mock.calls[0][0].input).toEqual({
      FromEmailAddress: 'access@example.test',
      Destination: { ToAddresses: ['cutout@example.test'] },
      Content: {
        Simple: {
          Subject: { Data: 'tarot-spa access request' },
          Body: { Text: { Data: 'Name: Priya Shah\nEmail: priya@example.com' } },
        },
      },
    });
  });

  it('collapses line breaks in the name before placing it in the body', async () => {
    const deps = dependencies();
    deps.ses.send.mockResolvedValueOnce({});

    await createHandler(deps)({
      arguments: { name: 'Priya\r\nEmail: forged', email: 'priya@example.com' },
    });

    const body = deps.ses.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data;
    expect(body).toBe('Name: Priya Email: forged\nEmail: priya@example.com');
  });

  it('caps oversized name and email values', async () => {
    const deps = dependencies();
    deps.ses.send.mockResolvedValueOnce({});
    const name = 'N'.repeat(250);
    const email = `${'e'.repeat(310)}@example.com`;

    await createHandler(deps)({ arguments: { name, email } });

    const body = deps.ses.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data;
    expect(body).toBe(`Name: ${name.slice(0, 200)}\nEmail: ${email.slice(0, 320)}`);
  });
});
