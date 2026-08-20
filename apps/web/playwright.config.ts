import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4177'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 2,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1366, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build -- --mode test && npm run preview -- --host 127.0.0.1 --port 4177',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
