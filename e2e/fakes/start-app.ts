// Arranque de la app para los tests: siembra el sandbox, levanta el COROS falso y lanza `astro dev`
// con el sandbox como cwd y el modelo falso activado (E2E_FAKE_AI=1). Lo ejecuta el webServer de Playwright.
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import { COROS_URL, startCorosServer } from './coros-server'
import { APP_PORT, PROJECT_ROOT, SANDBOX, seedSandbox } from './sandbox'

seedSandbox()
await startCorosServer()

const astro = spawn(
  resolve(PROJECT_ROOT, 'node_modules/.bin/astro'),
  ['dev', '--root', PROJECT_ROOT, '--port', String(APP_PORT), '--host', '127.0.0.1', '--ignore-lock'],
  {
    cwd: SANDBOX,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_FAKE_AI: '1',
      // Astro detecta que lo lanza un agente y se iría a segundo plano; esto lo fuerza en primer plano
      ASTRO_DEV_BACKGROUND: '1',
      COROS_MCP_URL: COROS_URL,
      // Clave y base URL falsas: si algo se saltara el modelo mock, la petición muere en local
      OPENAI_API_KEY: 'e2e-fake-key',
      OPENAI_MODEL: 'fake-model',
      OPENAI_BASE_URL: 'http://127.0.0.1:9',
      // Sin colores ni telemetría en la salida del dev server
      ASTRO_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    },
  },
)

const stop = () => {
  astro.kill('SIGTERM')
  process.exit(0)
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
astro.on('exit', (code) => process.exit(code ?? 0))
