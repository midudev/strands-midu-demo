// @ts-check
import { fileURLToPath } from 'node:url'

import node from '@astrojs/node'
import { defineConfig } from 'astro/config'

const fakeAi = process.env.E2E_FAKE_AI === '1'
const realModel = fileURLToPath(new URL('./src/agent/model.ts', import.meta.url))
const fakeModel = fileURLToPath(new URL('./e2e/fakes/model.ts', import.meta.url))

// Los tests e2e (E2E_FAKE_AI=1) no deben instanciar OpenAIModel ni gastar tokens.
// Cualquier import de src/agent/model.ts se resuelve al modelo falso.
function e2eFakeModelPlugin() {
  return {
    name: 'e2e-fake-ai-model',
    enforce: /** @type {const} */ ('pre'),
    /**
     * @param {string} source
     * @param {string | undefined} importer
     */
    resolveId(source, importer) {
      if (source === fakeModel || source.includes('e2e/fakes/model')) return null
      if (!importer) return null

      const from = importer.replace(/\\/g, '/')
      const fromAgent = from.includes('/src/agent/')
      const fromLib = from.includes('/src/lib/')
      if (fromAgent && (source === './model' || source === './model.ts')) return fakeModel
      if (fromLib && (source === '../agent/model' || source === '../agent/model.ts')) return fakeModel
      if (source === realModel || source.endsWith('/src/agent/model') || source.endsWith('/src/agent/model.ts')) {
        return fakeModel
      }
      return null
    },
  }
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  devToolbar: { enabled: false },
  security: {
    // Necesario para que Astro confíe en X-Forwarded-Proto/Host del reverse proxy (Caddy)
    // y url.origin sea https://strands.midu.run (el OAuth de COROS exige redirect_uri https)
    allowedDomains: [
      { hostname: 'strands.midu.run', protocol: 'https' },
      { hostname: 'localhost' },
    ],
  },
  vite: fakeAi
    ? {
        plugins: [e2eFakeModelPlugin()],
        resolve: {
          alias: { [realModel]: fakeModel },
        },
      }
    : {},
})
