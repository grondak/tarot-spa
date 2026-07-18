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
    try {
      await expect.poll(() => drawCode.textContent(), { timeout: 500 }).not.toBe(originalCode);
      newCode = await drawCode.textContent();
    } catch {
      // A random redraw can reproduce the original code; retry the draw.
    }
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

test('visitor sees inline access-request validation', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Request Access' })).toBeVisible();
  const name = page.getByRole('textbox', { name: 'Name' });
  const email = page.getByRole('textbox', { name: 'Email' });
  await expect(name).toBeVisible();
  await expect(email).toBeVisible();

  await page.getByRole('button', { name: 'Request Access' }).click();
  await expect(page.getByText('Please enter your name.')).toBeVisible();

  await name.fill('Priya Shah');
  await email.fill('not-an-email');
  await page.getByRole('button', { name: 'Request Access' }).click();
  await expect(page.getByText("That email address doesn't look right — double-check it.")).toBeVisible();
});
