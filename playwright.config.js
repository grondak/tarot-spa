import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/auth\.setup\.js/, /authenticated\.spec\.js/],
    },
    // Authenticated projects only exist when test-account credentials are present,
    // so machines without them still get a green unauthenticated run.
    ...(process.env.TAROT_E2E_EMAIL
      ? [
          {
            name: 'setup',
            testMatch: /auth\.setup\.js/,
            use: { ...devices['Desktop Chrome'] },
          },
          {
            name: 'chromium-auth',
            testMatch: /authenticated\.spec\.js/,
            dependencies: ['setup'],
            use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
          },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
