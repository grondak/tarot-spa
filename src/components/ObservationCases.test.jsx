import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ObservationCases from './ObservationCases';
import { fakeCasesApi } from '../utils/observation/fakeCasesApi';
import { useCases } from '../utils/observation/useCases';

function Harness({ api }) {
  return <ObservationCases cases={useCases(api)} />;
}

async function renderCases(api = fakeCasesApi()) {
  render(<Harness api={api} />);
  await waitFor(() => expect(screen.queryByText('Loading your cases…')).toBeNull());
  return api;
}

const title = () => screen.getByLabelText('The decision I’m weighing');
const hypothesis = () => screen.getByLabelText('My hypothesis, in my own words');

describe('ObservationCases', () => {
  it('asks for the hypothesis and fills nothing in for the user', async () => {
    await renderCases();
    expect(hypothesis()).toHaveValue('');
    expect(hypothesis()).toHaveAttribute('placeholder', expect.stringContaining('Nothing is filled in for you'));
    expect(screen.getByRole('button', { name: 'Open case' })).toBeDisabled();
  });

  it('opens a case with the user\'s own words and records when', async () => {
    const api = await renderCases();
    fireEvent.change(title(), { target: { value: '  Plant a u-pick patch?  ' } });
    fireEvent.change(hypothesis(), { target: { value: 'Demand outruns supply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open case' }));

    expect(await screen.findByText('Plant a u-pick patch?')).toBeVisible();
    expect(api.openCase).toHaveBeenCalledWith({ title: 'Plant a u-pick patch?', hypothesis: 'Demand outruns supply' });
    expect(screen.getByLabelText('My hypothesis')).toHaveValue('Demand outruns supply');
    expect(screen.getByText(/^Opened /)).toBeVisible();
  });

  it('saves an edited hypothesis', async () => {
    const api = await renderCases(fakeCasesApi({
      cases: [{ id: 'c1', title: 'A', hypothesis: 'old', status: 'OPEN' }],
      events: [{ caseId: 'c1', kind: 'OPENED', at: '2026-11-01T10:00:00Z' }],
    }));
    const save = screen.getByRole('button', { name: 'Save hypothesis' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('My hypothesis'), { target: { value: ' new ' } });
    fireEvent.click(save);
    await waitFor(() => expect(api.saveCaseText).toHaveBeenCalledWith('c1', { title: 'A', hypothesis: 'new' }));
  });

  it('closes without asking anything, shows the cycle, and reopens with the words intact', async () => {
    const api = await renderCases(fakeCasesApi({
      cases: [{ id: 'c1', title: 'Plant a patch?', hypothesis: 'Demand', status: 'OPEN' }],
      events: [
        { caseId: 'c1', kind: 'OPENED', at: '2026-10-01T09:00:00Z' },
        { caseId: 'c1', kind: 'HANDED_OFF', at: '2026-10-09T09:00:00Z' },
      ],
    }));
    expect(screen.getByText(/\(8 days to orient\)/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close case' }));
    await waitFor(() => expect(api.setCaseStatus).toHaveBeenCalledWith('c1', 'CLOSED'));
    expect(screen.queryByLabelText('My hypothesis')).toBeNull(); // nothing open; only the new-case form is left
    expect(title()).toBeVisible();
    fireEvent.click(screen.getByText('1 closed case'));
    expect(screen.getByText(/to decide\)/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(api.setCaseStatus).toHaveBeenCalledWith('c1', 'OPEN'));
    expect(await screen.findByLabelText('My hypothesis')).toHaveValue('Demand');
    expect(screen.queryByText(/to decide\)/)).toBeNull();
  });

  it('switches between open cases', async () => {
    await renderCases(fakeCasesApi({
      cases: [
        { id: 'c1', title: 'Strawberries', hypothesis: 'one', status: 'OPEN' },
        { id: 'c2', title: 'Franchise', hypothesis: 'two', status: 'OPEN' },
      ],
      events: [
        { caseId: 'c1', kind: 'OPENED', at: '2026-10-01T09:00:00Z' },
        { caseId: 'c2', kind: 'OPENED', at: '2026-10-05T09:00:00Z' },
      ],
    }));
    expect(screen.getByLabelText('My hypothesis')).toHaveValue('two'); // newest first
    fireEvent.change(screen.getByLabelText('Working on'), { target: { value: 'c1' } });
    expect(screen.getByLabelText('My hypothesis')).toHaveValue('one');
  });

  it('deletes one case without touching the others, after a confirm', async () => {
    const api = await renderCases(fakeCasesApi({
      cases: [
        { id: 'c1', title: 'Keep me', hypothesis: '', status: 'OPEN' },
        { id: 'c2', title: 'Drop me', hypothesis: '', status: 'CLOSED' },
      ],
      events: [{ caseId: 'c1', kind: 'OPENED', at: '2026-10-01T09:00:00Z' }, { caseId: 'c2', kind: 'OPENED', at: '2026-10-02T09:00:00Z' }],
    }));
    fireEvent.click(screen.getByText('1 closed case'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete “Drop me”' }));
    await waitFor(() => expect(api.deleteCase).toHaveBeenCalledWith('c2'));
    expect(screen.queryByText('Drop me')).toBeNull();
    expect(screen.getByText('Keep me')).toBeVisible();
  });

  it('deletes everything only after a second click', async () => {
    const api = await renderCases(fakeCasesApi({
      cases: [{ id: 'c1', title: 'A', hypothesis: '', status: 'OPEN' }],
      events: [{ caseId: 'c1', kind: 'OPENED', at: '2026-10-01T09:00:00Z' }],
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete all my cases' }));
    expect(api.deleteAllCases).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete every case I wrote' }));
    await waitFor(() => expect(api.deleteAllCases).toHaveBeenCalledOnce());
    expect(await screen.findByLabelText('The decision I’m weighing')).toBeVisible();
  });

  it('says so, and changes nothing, when a save fails', async () => {
    const api = fakeCasesApi();
    api.openCase.mockRejectedValueOnce(new Error('offline'));
    await renderCases(api);
    fireEvent.change(title(), { target: { value: 'Plant a patch?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open case' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t save');
    expect(title()).toHaveValue('Plant a patch?');
  });

  it('offers a retry when the cases will not load', async () => {
    const api = fakeCasesApi();
    api.loadCases.mockRejectedValueOnce(new Error('offline'));
    render(<Harness api={api} />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/couldn’t load/)).toBeVisible();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('The decision I’m weighing')).toBeVisible();
  });
});
