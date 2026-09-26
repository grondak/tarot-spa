import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertMonthlyBudgetCeilingHolds,
  COST_ESTIMATE_USD,
  DAILY_LIMIT_MAX,
  DAILY_LIMIT_MIN,
  isValidConfig,
  MAX_MONTHLY_BUDGET_USD,
  MIN_MONTHLY_BUDGET_USD,
} from './config';

describe('shared Config bounds and validation guard', () => {
  it('derives the monthly minimum from the shared reservation cost estimate', () => {
    expect(MIN_MONTHLY_BUDGET_USD).toBe(COST_ESTIMATE_USD);
  });

  it('accepts the exact inclusive minima and maxima', () => {
    expect(isValidConfig({ dailyLimit: DAILY_LIMIT_MIN, monthlyBudget: MIN_MONTHLY_BUDGET_USD })).toBe(true);
    expect(isValidConfig({ dailyLimit: DAILY_LIMIT_MAX, monthlyBudget: MAX_MONTHLY_BUDGET_USD })).toBe(true);
  });

  it('rejects missing or incomplete Config values', () => {
    expect(isValidConfig(undefined)).toBe(false);
    expect(isValidConfig(null)).toBe(false);
    expect(isValidConfig({})).toBe(false);
    expect(isValidConfig({ dailyLimit: 5 })).toBe(false);
    expect(isValidConfig({ monthlyBudget: 30 })).toBe(false);
  });

  it('rejects non-finite dailyLimit or monthlyBudget', () => {
    expect(isValidConfig({ dailyLimit: NaN, monthlyBudget: 30 })).toBe(false);
    expect(isValidConfig({ dailyLimit: Infinity, monthlyBudget: 30 })).toBe(false);
    expect(isValidConfig({ dailyLimit: 5, monthlyBudget: NaN })).toBe(false);
    expect(isValidConfig({ dailyLimit: 5, monthlyBudget: Infinity })).toBe(false);
  });

  it('rejects zero or negative values', () => {
    expect(isValidConfig({ dailyLimit: 0, monthlyBudget: 30 })).toBe(false);
    expect(isValidConfig({ dailyLimit: -1, monthlyBudget: 30 })).toBe(false);
    expect(isValidConfig({ dailyLimit: 5, monthlyBudget: 0 })).toBe(false);
    expect(isValidConfig({ dailyLimit: 5, monthlyBudget: -1 })).toBe(false);
  });

  it('rejects a fractional dailyLimit', () => {
    expect(isValidConfig({ dailyLimit: 5.5, monthlyBudget: 30 })).toBe(false);
  });

  it('rejects values above either maximum', () => {
    expect(isValidConfig({ dailyLimit: DAILY_LIMIT_MAX + 1, monthlyBudget: 30 })).toBe(false);
    expect(isValidConfig({ dailyLimit: 5, monthlyBudget: MAX_MONTHLY_BUDGET_USD + 0.01 })).toBe(false);
  });

  it('rejects a monthlyBudget below the reservation cost estimate', () => {
    expect(isValidConfig({ dailyLimit: 5, monthlyBudget: MIN_MONTHLY_BUDGET_USD - 0.01 })).toBe(false);
  });
});

describe('assertMonthlyBudgetCeilingHolds', () => {
  it('accepts a ceiling equal to or above the editable maximum', () => {
    expect(() => assertMonthlyBudgetCeilingHolds(MAX_MONTHLY_BUDGET_USD)).not.toThrow();
    expect(() => assertMonthlyBudgetCeilingHolds(MAX_MONTHLY_BUDGET_USD + 1)).not.toThrow();
  });

  it('throws if the ceiling would sit below the editable maximum', () => {
    expect(() => assertMonthlyBudgetCeilingHolds(MAX_MONTHLY_BUDGET_USD - 1)).toThrow(
      /must be >= MAX_MONTHLY_BUDGET_USD/,
    );
  });
});

describe('bundlability guard', () => {
  it('has no imports or side-effecting statements, so it stays safe for the frontend bundle', () => {
    const source = readFileSync(resolve(import.meta.dirname, './config.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import /m);
    expect(source).not.toContain('require(');
    expect(source).not.toContain('process.env');
  });
});
