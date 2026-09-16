// Fixture común: bloquea cualquier petición a internet (mapas, CDNs) para que los tests sean rápidos y deterministas.
import { test as base, expect } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort())
    await use(page)
  },
})

export { expect }

/** Lee un stream NDJSON completo y devuelve los eventos parseados. */
export async function ndjson(body: string) {
  return body
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown> & { type: string })
}
