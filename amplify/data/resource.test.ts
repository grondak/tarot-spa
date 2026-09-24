import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DAILY_LIMIT_MAX,
  DAILY_LIMIT_MIN,
  DAILY_LIMIT_VALIDATION_MESSAGE,
  MAX_MONTHLY_BUDGET_USD,
  MIN_MONTHLY_BUDGET_USD,
  MONTHLY_BUDGET_VALIDATION_MESSAGE,
} from '../config';

// Amplify Gen 2's schema builder exposes no stable public runtime API for
// introspecting a model's authorization/validation rules, so this is a
// lightweight source contract test: it isolates the Config model's block of
// amplify/data/resource.ts and asserts on its literal text. Each assertion
// is chosen to fail against a specific deliberately wrong mutation (broadened
// authorization, dropped required(), or a hand-typed bound/message that
// drifts from the shared amplify/config.ts constants).
const source = readFileSync(resolve(import.meta.dirname, './resource.ts'), 'utf8');

function extractModelBlock(modelName: string) {
  const header = `\n  ${modelName}: a\n`;
  const start = source.indexOf(header);
  if (start === -1) throw new Error(`${modelName} model not found in amplify/data/resource.ts`);
  const nextHeader = /\n {2}[A-Za-z]+: a\n/g;
  nextHeader.lastIndex = start + header.length;
  const next = nextHeader.exec(source);
  return next ? source.slice(start, next.index) : source.slice(start);
}

describe('Config schema contract (amplify/data/resource.ts)', () => {
  const configBlock = extractModelBlock('Config');

  it('authorizes only the Admin group to update, with no other Config operation grant', () => {
    expect(configBlock).toContain(
      ".authorization((allow) => [allow.group('Admin').to(['update'])]),",
    );
    expect(configBlock).not.toMatch(/allow\.authenticated\(/);
    expect(configBlock).not.toMatch(/allow\.publicApiKey\(/);
    expect(configBlock).not.toMatch(/allow\.owner\(/);
    expect(configBlock).not.toMatch(/\.to\(\[[^\]]*(create|read|delete|list|get|subscribe)[^\]]*\]\)/);
  });

  it('requires dailyLimit and validates it with the frozen bounds and exact message', () => {
    expect(configBlock).toMatch(/dailyLimit: a\.integer\(\)\.required\(\)\.validate\(/);
    expect(configBlock).toContain(
      'v.gte(DAILY_LIMIT_MIN, DAILY_LIMIT_VALIDATION_MESSAGE).lte(DAILY_LIMIT_MAX, DAILY_LIMIT_VALIDATION_MESSAGE)',
    );
    expect(DAILY_LIMIT_MIN).toBe(1);
    expect(DAILY_LIMIT_MAX).toBe(100);
    expect(DAILY_LIMIT_VALIDATION_MESSAGE).toBe('Daily limit must be a whole number from 1 to 100.');
  });

  it('requires monthlyBudget and validates it with the frozen bounds and exact message', () => {
    expect(configBlock).toMatch(/monthlyBudget: a\.float\(\)\.required\(\)\.validate\(/);
    expect(configBlock).toContain(
      'v.gte(MIN_MONTHLY_BUDGET_USD, MONTHLY_BUDGET_VALIDATION_MESSAGE).lte(MAX_MONTHLY_BUDGET_USD, MONTHLY_BUDGET_VALIDATION_MESSAGE)',
    );
    expect(MIN_MONTHLY_BUDGET_USD).toBe(0.03);
    expect(MAX_MONTHLY_BUDGET_USD).toBe(30);
    expect(MONTHLY_BUDGET_VALIDATION_MESSAGE).toBe('Monthly budget must be between $0.03 and $30.00.');
  });

  it('declares exactly the two Config fields, so no third field silently escapes this contract', () => {
    const fieldNames = [...configBlock.matchAll(/^ {6}(\w+): a\.(?:integer|float)\(\)/gm)]
      .map((match) => match[1]);
    expect(fieldNames.sort()).toEqual(['dailyLimit', 'monthlyBudget']);
  });
});
