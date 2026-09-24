import { useEffect, useRef, useState } from 'react';
import { updateAdminConfig } from '../utils/adminConfig';

// Mirrors the frozen bounds in amplify/config.ts — see
// amplify/data/resource.test.ts's cross-check for drift protection.
const DAILY_LIMIT_MIN = 1;
const DAILY_LIMIT_MAX = 100;
const MONTHLY_BUDGET_MIN = 0.03;
const MONTHLY_BUDGET_MAX = 30;
const DAILY_LIMIT_MESSAGE = 'Daily limit must be a whole number from 1 to 100.';
const MONTHLY_BUDGET_MESSAGE = 'Monthly budget must be between $0.03 and $30.00.';
const SAVE_SUCCESS_MESSAGE = 'Cost controls saved.';
const SAVE_ERROR_MESSAGE = 'Cost controls couldn’t be saved. Please try again.';

const inputClass = 'mt-1 w-32 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-60';

function parseDailyLimit(value) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)
    || parsed < DAILY_LIMIT_MIN || parsed > DAILY_LIMIT_MAX) {
    return { error: DAILY_LIMIT_MESSAGE };
  }
  return { value: parsed };
}

function parseMonthlyBudget(value) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < MONTHLY_BUDGET_MIN || parsed > MONTHLY_BUDGET_MAX) {
    return { error: MONTHLY_BUDGET_MESSAGE };
  }
  return { value: parsed };
}

export default function AdminConfigEditor({
  dailyLimit: initialDailyLimit,
  monthlyBudget: initialMonthlyBudget,
  updateAdminConfigFn = updateAdminConfig,
  onSaved = () => {},
}) {
  const [dailyLimit, setDailyLimit] = useState(String(initialDailyLimit));
  const [monthlyBudget, setMonthlyBudget] = useState(String(initialMonthlyBudget));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  async function handleSave() {
    if (submitting.current) return;

    const dailyLimitResult = parseDailyLimit(dailyLimit);
    const monthlyBudgetResult = parseMonthlyBudget(monthlyBudget);
    const validationError = dailyLimitResult.error ?? monthlyBudgetResult.error;
    if (validationError) {
      setStatus('');
      setError(validationError);
      return;
    }

    submitting.current = true;
    setBusy(true);
    setStatus('');
    setError('');

    try {
      const saved = await updateAdminConfigFn({
        dailyLimit: dailyLimitResult.value,
        monthlyBudget: monthlyBudgetResult.value,
      });
      if (!mounted.current) return;
      setDailyLimit(String(saved.dailyLimit));
      setMonthlyBudget(String(saved.monthlyBudget));
      setStatus(SAVE_SUCCESS_MESSAGE);
      onSaved(saved);
    } catch {
      if (!mounted.current) return;
      setError(SAVE_ERROR_MESSAGE);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section aria-label="Cost controls" className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="admin-daily-limit" className="block text-sm text-gray-300">
            Daily request limit
          </label>
          <input
            id="admin-daily-limit"
            type="number"
            min={DAILY_LIMIT_MIN}
            max={DAILY_LIMIT_MAX}
            step="1"
            value={dailyLimit}
            disabled={busy}
            onChange={(event) => setDailyLimit(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="admin-monthly-budget" className="block text-sm text-gray-300">
            Monthly budget (USD)
          </label>
          <input
            id="admin-monthly-budget"
            type="number"
            min={MONTHLY_BUDGET_MIN}
            max={MONTHLY_BUDGET_MAX}
            step="0.01"
            value={monthlyBudget}
            disabled={busy}
            onChange={(event) => setMonthlyBudget(event.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save cost controls'}
        </button>
      </div>
      {status && <p role="status" className="mt-2 text-sm text-gray-400">{status}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
