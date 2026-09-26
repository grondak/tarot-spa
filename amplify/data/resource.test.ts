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

// Exported via module scope (not just used inline) so the fallback-bound
// branch below — unreachable against the real resource.ts, where
// `checkInviteKey` always immediately follows `Config` and satisfies
// `nextHeader` — can still be exercised directly with synthetic input.
function extractModelBlock(text: string, modelName: string) {
  const header = new RegExp(`\\n\\s*${modelName}:\\s*a\\n`);
  const headerMatch = header.exec(text);
  if (!headerMatch) throw new Error(`${modelName} model not found`);
  const start = headerMatch.index;
  const nextHeader = /\n\s*[A-Za-z]+:\s*a\n/g;
  nextHeader.lastIndex = start + headerMatch[0].length;
  const next = nextHeader.exec(text);
  if (next) return text.slice(start, next.index);
  // Fallback for when the target is the last model/operation declared in
  // the schema (not currently true for Config, but kept for whichever
  // model/operation ends up last after a future reorg): bound at the
  // schema object's own closing `});` instead of slicing to end-of-file,
  // so unrelated trailing source text can't leak into the block.
  const schemaClose = text.indexOf('\n});', start);
  return schemaClose === -1 ? text.slice(start) : text.slice(start, schemaClose);
}

describe('extractModelBlock fallback bound (synthetic)', () => {
  it('stops at the schema-closing marker when there is no next model header', () => {
    const synthetic = [
      'const schema = a.schema({',
      '  OnlyModel: a',
      '    .model({',
      '      field: a.string(),',
      '    }),',
      '});',
      '',
      '// unrelated trailing content that must not leak into the block',
    ].join('\n');

    const block = extractModelBlock(synthetic, 'OnlyModel');

    expect(block).toContain('field: a.string()');
    expect(block).not.toContain('unrelated trailing content');
  });
});

describe('Config schema contract (amplify/data/resource.ts)', () => {
  const configBlock = extractModelBlock(source, 'Config');

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

  it('declares exactly the two Config fields, so no third field of any type silently escapes this contract', () => {
    // Matches any field type (not just integer/float) at any indentation depth,
    // so a future non-numeric field addition can't slip past this assertion.
    const fieldNames = [...configBlock.matchAll(/^\s+(\w+): a\.\w+\(/gm)]
      .map((match) => match[1]);
    expect(fieldNames.sort()).toEqual(['dailyLimit', 'monthlyBudget']);
  });
});
