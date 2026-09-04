import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4177'
// Only auto-start a local build+preview when targeting the default local URL;
// PLAYWRIGHT_BASE_URL lets this same config point at a remote/staging environment instead.
const isLocalTarget = !process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1366, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(isLocalTarget
    ? {
        webServer: {
          command: 'npm run build -- --mode test-real && npm run preview -- --host 127.0.0.1 --port 4177',
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }
    : {}),
})
