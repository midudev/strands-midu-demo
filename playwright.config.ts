import { defineConfig, devices } from '@playwright/test'

import { APP_URL } from './e2e/fakes/sandbox'

/**
 * Tests e2e sin gastar tokens: el modelo es falso (e2e/fakes/model.ts) y COROS también (e2e/fakes/coros-server.ts).
 * Un solo worker y en orden: los tests comparten el estado del servidor (sesión del chat, cachés en e2e/.sandbox/).
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: './e2e/.results',
  use: {
    baseURL: APP_URL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec tsx e2e/fakes/start-app.ts',
    url: APP_URL,
    // Nunca reutilizar: si hubiera un servidor real en este puerto, gastaríamos tokens de verdad
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
