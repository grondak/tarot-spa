import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_LIMIT_MAX,
  DAILY_LIMIT_MIN,
  DAILY_LIMIT_VALIDATION_MESSAGE,
  MAX_MONTHLY_BUDGET_USD,
  MIN_MONTHLY_BUDGET_USD,
  MONTHLY_BUDGET_VALIDATION_MESSAGE,
} from '../../amplify/config';
import AdminConfigEditor from './AdminConfigEditor';

function renderEditor(props = {}) {
  const updateAdminConfigFn = props.updateAdminConfigFn ?? vi.fn().mockResolvedValue({
    dailyLimit: 10,
    monthlyBudget: 15.5,
  });
  const onSaved = props.onSaved ?? vi.fn();
  const utils = render(
    <AdminConfigEditor
      dailyLimit={props.dailyLimit ?? 5}
      monthlyBudget={props.monthlyBudget ?? 30}
      updateAdminConfigFn={updateAdminConfigFn}
      onSaved={onSaved}
    />,
  );
  return { ...utils, updateAdminConfigFn, onSaved };
}

describe('AdminConfigEditor', () => {
  it('mirrors the frozen bounds and messages from amplify/config.ts without drift', () => {
    renderEditor();

    const dailyLimitInput = screen.getByLabelText('Daily request limit');
    const monthlyBudgetInput = screen.getByLabelText('Monthly budget (USD)');
    expect(dailyLimitInput).toHaveAttribute('min', String(DAILY_LIMIT_MIN));
    expect(dailyLimitInput).toHaveAttribute('max', String(DAILY_LIMIT_MAX));
    expect(monthlyBudgetInput).toHaveAttribute('min', String(MIN_MONTHLY_BUDGET_USD));
    expect(monthlyBudgetInput).toHaveAttribute('max', String(MAX_MONTHLY_BUDGET_USD));

    fireEvent.change(dailyLimitInput, { target: { value: String(DAILY_LIMIT_MAX + 1) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));
    expect(screen.getByRole('alert')).toHaveTextContent(DAILY_LIMIT_VALIDATION_MESSAGE);
  });

  it('mirrors the frozen monthly budget message from amplify/config.ts without drift', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Monthly budget (USD)'), {
      target: { value: String(MAX_MONTHLY_BUDGET_USD + 0.01) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));
    expect(screen.getByRole('alert')).toHaveTextContent(MONTHLY_BUDGET_VALIDATION_MESSAGE);
  });

  it('renders the initial pair in labeled fields', () => {
    renderEditor({ dailyLimit: 5, monthlyBudget: 30 });

    expect(screen.getByLabelText('Daily request limit')).toHaveValue(5);
    expect(screen.getByLabelText('Monthly budget (USD)')).toHaveValue(30);
  });

  it('sends both parsed values together when only one field is edited', async () => {
    const { updateAdminConfigFn } = renderEditor({ dailyLimit: 5, monthlyBudget: 30 });

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));

    await waitFor(() => expect(updateAdminConfigFn).toHaveBeenCalledOnce());
    expect(updateAdminConfigFn).toHaveBeenCalledWith({ dailyLimit: 10, monthlyBudget: 30 });
  });

  it.each([
    ['blank daily limit', '', '30', 'Daily limit must be a whole number from 1 to 100.'],
    ['non-finite daily limit', 'abc', '30', 'Daily limit must be a whole number from 1 to 100.'],
    ['fractional daily limit', '5.5', '30', 'Daily limit must be a whole number from 1 to 100.'],
    ['zero daily limit', '0', '30', 'Daily limit must be a whole number from 1 to 100.'],
    ['daily limit above maximum', '101', '30', 'Daily limit must be a whole number from 1 to 100.'],
    ['trailing junk daily limit', '5abc', '30', 'Daily limit must be a whole number from 1 to 100.'],
    ['blank monthly budget', '5', '', 'Monthly budget must be between $0.03 and $30.00.'],
    ['non-finite monthly budget', '5', 'abc', 'Monthly budget must be between $0.03 and $30.00.'],
    ['monthly budget below minimum', '5', '0.02', 'Monthly budget must be between $0.03 and $30.00.'],
    ['monthly budget above maximum', '5', '30.01', 'Monthly budget must be between $0.03 and $30.00.'],
    ['trailing junk monthly budget', '5', '30abc', 'Monthly budget must be between $0.03 and $30.00.'],
  ])('rejects %s with an inline error and makes zero network calls', async (
    _label,
    dailyLimitValue,
    monthlyBudgetValue,
    message,
  ) => {
    const { updateAdminConfigFn } = renderEditor();

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: dailyLimitValue } });
    fireEvent.change(screen.getByLabelText('Monthly budget (USD)'), { target: { value: monthlyBudgetValue } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(updateAdminConfigFn).not.toHaveBeenCalled();
  });

  it('accepts the exact inclusive minimum boundary values', async () => {
    const { updateAdminConfigFn } = renderEditor();

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Monthly budget (USD)'), { target: { value: '0.03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));

    await waitFor(() => expect(updateAdminConfigFn).toHaveBeenCalledWith({ dailyLimit: 1, monthlyBudget: 0.03 }));
  });

  it('accepts the exact inclusive maximum boundary values', async () => {
    const { updateAdminConfigFn } = renderEditor();

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Monthly budget (USD)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));

    await waitFor(() => expect(updateAdminConfigFn).toHaveBeenCalledWith({ dailyLimit: 100, monthlyBudget: 30 }));
  });

  it('makes exactly one call on rapid double submit', async () => {
    let resolveSave;
    const updateAdminConfigFn = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    renderEditor({ updateAdminConfigFn });

    const button = screen.getByRole('button', { name: 'Save cost controls' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(updateAdminConfigFn).toHaveBeenCalledOnce();
    resolveSave({ dailyLimit: 5, monthlyBudget: 30 });
    await waitFor(() => expect(screen.getByRole('status')).toBeVisible());
  });

  it('replaces inputs with the returned canonical values, announces success, and calls onSaved', async () => {
    const updateAdminConfigFn = vi.fn().mockResolvedValue({ dailyLimit: 7, monthlyBudget: 12.34 });
    const onSaved = vi.fn();
    renderEditor({ updateAdminConfigFn, onSaved, dailyLimit: 5, monthlyBudget: 30 });

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Cost controls saved.');
    expect(screen.getByLabelText('Daily request limit')).toHaveValue(7);
    expect(screen.getByLabelText('Monthly budget (USD)')).toHaveValue(12.34);
    expect(onSaved).toHaveBeenCalledWith({ dailyLimit: 7, monthlyBudget: 12.34 });
  });

  it('disables inputs and the Save button while a save is pending', async () => {
    let resolveSave;
    const updateAdminConfigFn = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    renderEditor({ updateAdminConfigFn });

    fireEvent.click(screen.getByRole('button', { name: /Save cost controls|Saving/ }));

    expect(screen.getByLabelText('Daily request limit')).toBeDisabled();
    expect(screen.getByLabelText('Monthly budget (USD)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

    resolveSave({ dailyLimit: 5, monthlyBudget: 30 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save cost controls' })).not.toBeDisabled());
  });

  it('keeps entered values and permits retry after a remote failure', async () => {
    const updateAdminConfigFn = vi.fn().mockRejectedValue(new Error('Not Authorized'));
    renderEditor({ updateAdminConfigFn, dailyLimit: 5, monthlyBudget: 30 });

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cost controls couldn’t be saved. Please try again.',
    );
    expect(screen.getByLabelText('Daily request limit')).toHaveValue(9);
    expect(screen.getByRole('button', { name: 'Save cost controls' })).not.toBeDisabled();

    updateAdminConfigFn.mockResolvedValueOnce({ dailyLimit: 9, monthlyBudget: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cost controls saved.');
  });

  it('does not update state after unmount while a save is pending', async () => {
    let resolveSave;
    const updateAdminConfigFn = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderEditor({ updateAdminConfigFn });

    fireEvent.click(screen.getByRole('button', { name: /Save cost controls|Saving/ }));
    unmount();
    resolveSave({ dailyLimit: 5, monthlyBudget: 30 });
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('shows both messages when both fields are invalid at once', async () => {
    const { updateAdminConfigFn } = renderEditor();

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Monthly budget (USD)'), { target: { value: '0.02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(DAILY_LIMIT_VALIDATION_MESSAGE);
    expect(alert).toHaveTextContent(MONTHLY_BUDGET_VALIDATION_MESSAGE);
    expect(updateAdminConfigFn).not.toHaveBeenCalled();
  });

  it('submits on Enter (native form submission), not just a direct Save click', async () => {
    const { updateAdminConfigFn } = renderEditor({ dailyLimit: 5, monthlyBudget: 30 });

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: '9' } });
    fireEvent.submit(screen.getByLabelText('Daily request limit').closest('form'));

    await waitFor(() => expect(updateAdminConfigFn).toHaveBeenCalledWith({ dailyLimit: 9, monthlyBudget: 30 }));
  });

  it('marks invalid inputs with aria-invalid and links them to the rendered error', async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Daily request limit'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost controls' }));

    const alert = await screen.findByRole('alert');
    expect(screen.getByLabelText('Daily request limit')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Daily request limit')).toHaveAttribute('aria-describedby', alert.id);
  });
});
