import { randomUUID } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

// Keep browser binaries inside this checkout, including in CI.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0'
process.env.IOTEAMS_E2E_NONCE ??= randomUUID()
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, forbidOnly: !!process.env.CI, retries: 0,
  workers: process.env.CI ? 2 : 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run build --workspace painel && node --import tsx tests/e2e/server.ts',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    url: 'http://127.0.0.1:4173', env: { PORT: '4173' }, reuseExistingServer: false, timeout: 60_000,
  },
})
