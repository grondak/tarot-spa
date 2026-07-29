import { expect, test } from '@playwright/test';

test('authenticated home is Context Entry with a working quick-draw bridge', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Help Me Orient', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder(/Tell me about your upcoming decision/)).toBeVisible();
  await expect(page.getByText('Single Card')).toBeVisible();
  await expect(page.getByText('Three Card')).toBeVisible();
  await expect(page.getByText('Decision', { exact: true })).toBeVisible();
  await expect(page.getByText('System Analysis')).toBeVisible();
  await expect(page.getByText('❦')).toHaveCount(2);

  const cta = page.getByRole('button', { name: 'Help Me Orient', exact: true });
  await expect(cta).toBeDisabled();

  await page.getByLabel('Context').fill('Deciding whether to take the new role.');
  await page.getByRole('button', { name: 'Decision Current State' }).click();
  await expect(cta).toBeEnabled();

  await page.getByRole('button', { name: 'Draw for fun instead' }).click();
  await expect(page.getByRole('heading', { name: 'Quick Draw' })).toBeVisible();
  await page.getByRole('button', { name: /Single Card/ }).click();
  await expect(page.locator('img')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draw Again' })).toBeVisible();

  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByRole('heading', { name: 'Help Me Orient', exact: true })).toBeVisible();

  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Admin Dashboard' })).toHaveCount(0);
});
