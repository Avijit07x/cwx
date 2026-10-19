import { defineConfig } from '@playwright/test';

const CI = Boolean(process.env.CI);
const TARGET = process.env.PLAYWRIGHT_BASE_URL;

export const BASE_URL = TARGET ?? 'http://localhost:5173';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer:
    TARGET === undefined
      ? { command: 'pnpm dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !CI }
      : undefined,
});
