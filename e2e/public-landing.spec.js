import { expect, test } from '@playwright/test';

test('visitor can draw, redraw, reload a code, and return to the landing', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Systems Thinking Tarot' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I have an Invite Key' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
  await expect(page.getByText('Your account')).not.toBeVisible();

  await page.getByRole('button', { name: /Single Card/ }).click();
  await expect(page.locator('img')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draw Again' })).toBeVisible();
  const drawCode = page.locator('code');
  const originalCode = await drawCode.textContent();

  let newCode = originalCode;
  for (let attempt = 0; attempt < 3 && newCode === originalCode; attempt += 1) {
    await page.getByRole('button', { name: 'Draw Again' }).click();
    newCode = await drawCode.textContent();
  }
  expect(newCode).not.toBe(originalCode);

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Draw code' }).fill(newCode);
  await page.getByRole('button', { name: 'Load' }).click();
  await expect(drawCode).toHaveText(newCode);

  await page.getByRole('button', { name: 'Draw Again' }).click();
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByText("Most bad decisions aren't made because people lack information" , { exact: false })).toBeVisible();
});
