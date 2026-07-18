import { expect, test as setup } from '@playwright/test';

setup('authenticate as the agent test account', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await page.getByLabel('Email').fill(process.env.TAROT_E2E_EMAIL);
  await page.getByLabel('Password').fill(process.env.TAROT_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Your account')).toBeVisible({ timeout: 15000 });
  // Amplify persists Cognito tokens shortly AFTER the UI flips to authenticated;
  // capturing storageState before they land saves an empty, logged-out state.
  await page.waitForFunction(
    () => Object.keys(localStorage).some((key) => key.startsWith('CognitoIdentityServiceProvider')),
    undefined,
    { timeout: 15000 },
  );
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
