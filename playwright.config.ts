import { defineConfig } from '@playwright/test';
import { env } from './src/config/env';

/**
 * Playwright is used here purely as an API test runner (no browsers are launched).
 * See https://playwright.dev/docs/api-testing
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // The API is rate limited per IP, so keep the request burst small.
  workers: 2,
  forbidOnly: !!process.env.CI,
  // Live API with live prices: one retry on CI absorbs transient network hiccups.
  retries: process.env.CI ? 1 : 0,
  // Generous timeout: a throttled request may wait up to ~2 min (Retry-After) before it is retried.
  timeout: 300_000,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'reports/html' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
  ],
  use: {
    baseURL: env.baseUrl,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
});
