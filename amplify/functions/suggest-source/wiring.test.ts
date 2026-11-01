// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const resourceSource = readFileSync(resolve(import.meta.dirname, '../../data/resource.ts'), 'utf8');
const backendSource = readFileSync(resolve(import.meta.dirname, '../../backend.ts'), 'utf8');

describe('suggest-source wiring', () => {
  it('is a mutation for signed-in users only, never the public API key', () => {
    const block = resourceSource.slice(resourceSource.indexOf('suggestSource: a'), resourceSource.indexOf('widenSearch: a'));
    expect(block).toContain('.mutation()');
    expect(block).toContain('allow.authenticated()');
    expect(block).not.toContain('publicApiKey');
  });

  it('may send mail and read no tables', () => {
    expect(backendSource).toMatch(/suggestSourceLambda\.addToRolePolicy/);
    expect(backendSource).not.toMatch(/\.grant[A-Za-z]*\([^)]*suggestSourceLambda/);
  });

  it('is rate limited per address at the edge', () => {
    expect(backendSource).toContain('RateLimitSuggestSourcePerIp');
    expect(backendSource).toContain("searchString: 'suggestSource'");
  });
});
