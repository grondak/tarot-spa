// Shared plain utility: numeric Config bounds and the fail-closed stored-value
// guard used by the schema, the worker, and every Config consumer. No AWS
// clients, side effects, or environment access — see Story 4.3 Dev Notes.

export const COST_ESTIMATE_USD = 0.03;

export const DAILY_LIMIT_MIN = 1;
export const DAILY_LIMIT_MAX = 100;
export const MIN_MONTHLY_BUDGET_USD = COST_ESTIMATE_USD;
export const MAX_MONTHLY_BUDGET_USD = 30;

export const DAILY_LIMIT_VALIDATION_MESSAGE = 'Daily limit must be a whole number from 1 to 100.';
export const MONTHLY_BUDGET_VALIDATION_MESSAGE = 'Monthly budget must be between $0.03 and $30.00.';

export type Config = {
  dailyLimit: number;
  monthlyBudget: number;
};

export function isValidConfig(value: unknown): value is Config {
  if (typeof value !== 'object' || value === null) return false;
  const { dailyLimit, monthlyBudget } = value as Record<string, unknown>;

  return (
    typeof dailyLimit === 'number'
    && Number.isInteger(dailyLimit)
    && dailyLimit >= DAILY_LIMIT_MIN
    && dailyLimit <= DAILY_LIMIT_MAX
    && typeof monthlyBudget === 'number'
    && Number.isFinite(monthlyBudget)
    && monthlyBudget >= MIN_MONTHLY_BUDGET_USD
    && monthlyBudget <= MAX_MONTHLY_BUDGET_USD
  );
}

// Pure guard for amplify/backend.ts's synth-time check that the fixed outer
// AWS Budget ceiling never sits below Config's editable maximum — kept here
// (testable in isolation) instead of inline in backend.ts, which has no
// existing test pattern to extend.
export function assertMonthlyBudgetCeilingHolds(awsSafetyCeilingUsd: number): void {
  if (awsSafetyCeilingUsd < MAX_MONTHLY_BUDGET_USD) {
    throw new Error(
      `awsSafetyCeilingUsd (${awsSafetyCeilingUsd}) must be >= MAX_MONTHLY_BUDGET_USD (${MAX_MONTHLY_BUDGET_USD})`,
    );
  }
}
