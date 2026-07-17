import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RequestAccess from './RequestAccess';

const requestAccessFn = vi.fn();

beforeEach(() => {
  requestAccessFn.mockReset();
});

function renderForm() {
  render(<RequestAccess requestAccessFn={requestAccessFn} />);
}

function fill(name, email) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: name } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: email } });
}

describe('RequestAccess', () => {
  it('renders the section copy and labeled fields', () => {
    renderForm();

    expect(screen.getByText('Want the Deeper Experience?')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Request Access' })).toBeVisible();
    expect(screen.getByText('Invite-only for now — leave your name and email and Tony will follow up personally.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeVisible();
  });

  it.each(['', '   '])('blocks an empty name inline', (name) => {
    renderForm();
    fill(name, 'priya@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Request Access' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your name.');
    expect(requestAccessFn).not.toHaveBeenCalled();
  });

  it.each(['not-an-email', 'a@b'])('blocks malformed email inline', (email) => {
    renderForm();
    fill('Priya Shah', email);

    fireEvent.click(screen.getByRole('button', { name: 'Request Access' }));

    expect(screen.getByRole('alert')).toHaveTextContent("That email address doesn't look right — double-check it.");
    expect(requestAccessFn).not.toHaveBeenCalled();
  });

  it('submits trimmed values and replaces the form with the acknowledgment', async () => {
    requestAccessFn.mockResolvedValueOnce(true);
    renderForm();
    fill(' Priya Shah ', ' priya@example.com ');

    fireEvent.click(screen.getByRole('button', { name: 'Request Access' }));

    await waitFor(() => expect(requestAccessFn).toHaveBeenCalledWith('Priya Shah', 'priya@example.com'));
    expect(screen.getAllByText('Request received — Tony will follow up personally.')).toHaveLength(2);
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument();
  });

  it('keeps the form intact after failure and permits a retry', async () => {
    requestAccessFn
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(true);
    renderForm();
    fill('Priya Shah', 'priya@example.com');
    const button = screen.getByRole('button', { name: 'Request Access' });

    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send your request right now. Please try again.");
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible();

    fireEvent.click(button);
    await waitFor(() => expect(requestAccessFn).toHaveBeenCalledTimes(2));
  });

  it('disables the busy button while the request is pending', () => {
    requestAccessFn.mockReturnValue(new Promise(() => {}));
    renderForm();
    fill('Priya Shah', 'priya@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Request Access' }));

    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
  });
});
