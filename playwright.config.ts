import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 45000, expect: { timeout: 10000 }, fullyParallel: false, workers: 1,
  forbidOnly: !!process.env.CI, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3212', trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 10000 },
  projects: [
    { name: 'api', testMatch: /\.api\.spec\.ts/ },
    ...(process.env.PLAYWRIGHT_LIVE_BASE_URL ? [{ name: 'provider-contracts', testMatch: /\.live\.spec\.ts/, use: { baseURL: process.env.PLAYWRIGHT_LIVE_BASE_URL, ...devices['Desktop Chrome'] } }] : []),
    ...(process.env.PLAYWRIGHT_GPU_BASE_URL ? [{ name: 'private-gpu-contracts', testMatch: /\.gpu\.spec\.ts/, use: { baseURL: process.env.PLAYWRIGHT_GPU_BASE_URL, ...devices['Desktop Chrome'] } }] : []),
    { name: 'desktop', testIgnore: /\.(api|live|gpu)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', testIgnore: /\.(api|live|gpu)\.spec\.ts/, use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium' } },
    { name: 'firefox', testIgnore: /\.(api|live|gpu)\.spec\.ts/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-mobile', testIgnore: /\.(api|live|gpu)\.spec\.ts/, use: { ...devices['iPhone 13'] } },
  ]
});
