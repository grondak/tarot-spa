import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ObservationSources from './ObservationSources';

const catalog = [
  { name: 'world', feeds: [{ id: 'bbc', name: 'BBC' }, { id: 'aj', name: 'Al Jazeera' }, { id: 'old', name: 'Old', retired: true }] },
  { name: 'telecom', feeds: [{ id: 'lr', name: 'Light Reading' }] },
  { name: 'outside your interests', feeds: [], injected: true },
];

describe('ObservationSources', () => {
  const open = (disabled = new Set(), extra = {}) => {
    const onChange = vi.fn();
    render(<ObservationSources catalog={catalog} disabled={disabled} onChange={onChange} suggestFn={vi.fn()} {...extra} />);
    return onChange;
  };

  it('counts what is on', () => {
    open(new Set(['f:bbc']));
    expect(screen.getByText('Sources and suggestions (4 of 5 on)')).toBeVisible();
  });

  it('shows each group with its sources, marking a retired one', () => {
    open();
    expect(screen.getByLabelText('Al Jazeera')).toBeChecked();
    expect(screen.getByLabelText('Old (retired)')).toBeChecked();
    expect(screen.getByText('One item a day from outside your interests.')).toBeInTheDocument();
  });

  it('reports a source and a group switched off', () => {
    const onChange = open();
    fireEvent.click(screen.getByLabelText('BBC'));
    expect(onChange).toHaveBeenLastCalledWith(new Set(['f:bbc']));
    fireEvent.click(screen.getByLabelText('telecom (whole group)'));
    expect(onChange).toHaveBeenLastCalledWith(new Set(['g:telecom']));
  });

  it('shows a partly-on group as indeterminate and an off group as unchecked', () => {
    open(new Set(['f:bbc', 'g:telecom']));
    expect(screen.getByLabelText('world (whole group)').indeterminate).toBe(true);
    expect(screen.getByLabelText('world (whole group)')).toBeChecked();
    expect(screen.getByLabelText('telecom (whole group)')).not.toBeChecked();
    expect(screen.getByLabelText('Light Reading')).not.toBeChecked();
  });

  it('treats a group with every source switched off one by one as off', () => {
    open(new Set(['f:lr']));
    expect(screen.getByLabelText('telecom (whole group)')).not.toBeChecked();
  });

  it('offers to switch everything back on only when something is off', () => {
    const onChange = open(new Set(['g:world']));
    fireEvent.click(screen.getByRole('button', { name: 'Switch every source back on' }));
    expect(onChange).toHaveBeenCalledWith(new Set());
  });

  it('has no switch-all-on button when everything is on', () => {
    open();
    expect(screen.queryByRole('button', { name: 'Switch every source back on' })).not.toBeInTheDocument();
  });
});

describe('suggesting a source', () => {
  const setup = (suggestFn) => {
    render(<ObservationSources catalog={catalog} disabled={new Set()} onChange={() => {}} suggestFn={suggestFn} />);
    const form = screen.getByText('Suggest a source').closest('form');
    return {
      form,
      send: () => fireEvent.click(within(form).getByRole('button', { name: /Send suggestion|Sending/ })),
      type: (label, value) => fireEvent.change(within(form).getByLabelText(label), { target: { value } }),
    };
  };

  it('cannot send an empty suggestion', () => {
    const suggestFn = vi.fn();
    const { form } = setup(suggestFn);
    expect(within(form).getByRole('button', { name: 'Send suggestion' })).toBeDisabled();
  });

  it('sends the text and contact, then confirms and clears the form', async () => {
    const suggestFn = vi.fn().mockResolvedValue(true);
    const { send, type, form } = setup(suggestFn);
    type('Your suggestion', '  sailing news  ');
    type(/How to reach you/, 'me@example.com');
    send();

    await waitFor(() => expect(suggestFn).toHaveBeenCalledWith('sailing news', 'me@example.com'));
    expect(await within(form).findByRole('status')).toHaveTextContent('Sent. Thank you.');
    expect(within(form).getByLabelText('Your suggestion')).toHaveValue('');
  });

  it('says it did not send, keeps the text, and lets the user try again', async () => {
    const suggestFn = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(true);
    const { send, type, form } = setup(suggestFn);
    type('Your suggestion', 'sailing news');
    send();

    expect(await within(form).findByRole('alert')).toHaveTextContent('didn’t send');
    expect(within(form).getByLabelText('Your suggestion')).toHaveValue('sailing news');
    send();
    expect(await within(form).findByRole('status')).toBeInTheDocument();
    expect(suggestFn).toHaveBeenCalledTimes(2);
  });

  it('does not send twice while a send is in progress', async () => {
    let finish;
    const suggestFn = vi.fn(() => new Promise((r) => { finish = r; }));
    const { send, type, form } = setup(suggestFn);
    type('Your suggestion', 'sailing news');
    send();
    expect(within(form).getByRole('button', { name: 'Sending…' })).toBeDisabled();
    fireEvent.submit(form);
    expect(suggestFn).toHaveBeenCalledOnce();
    finish(true);
    await within(form).findByRole('status');
  });
});
