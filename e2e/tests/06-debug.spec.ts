import { seedAuth, seedRaces } from '../fakes/sandbox'
import { expect, test } from '../fixtures'

test.describe('Página /debug', () => {
  test('muestra runtime, ficheros, datos guardados y trazas filtrables', async ({ page, request }) => {
    // Una llamada a la API deja una traza http que luego filtramos
    await request.get('/api/team')
    await page.goto('/debug')

    const runtime = page.locator('#runtime')
    await expect(runtime).toContainText('conectado')
    await expect(runtime).toContainText('fake-model')
    await expect(runtime).toContainText('en memoria')
    await expect(page.locator('#clock')).toHaveText(/\d{2}:\d{2}:\d{2}/)

    await expect(page.locator('#files li', { hasText: 'data/races.json' })).toBeVisible()
    await expect(page.locator('#files li', { hasText: 'data/briefing.json' })).not.toHaveClass(/empty/)
    await expect(page.locator('#stored details')).toHaveCount(4)
    await expect(page.locator('#stored')).toContainText('Piernas frescas')

    // Trazas: la lista y los filtros por scope
    await expect(page.locator('#traces li.tr').first()).toBeVisible()
    await expect(page.locator('#filters .chip', { hasText: 'all' })).toHaveClass(/on/)
    const httpChip = page.locator('#filters .chip[data-scope="http"]')
    await expect(httpChip).toBeVisible()
    await httpChip.click()
    await expect(httpChip).toHaveClass(/on/)
    const scopes = await page.locator('#traces li.tr .scope').allTextContents()
    expect(scopes.length).toBeGreaterThan(0)
    expect(new Set(scopes)).toEqual(new Set(['http']))
  })

  test('abre un fichero local en el visor y el de auth va sanitizado', async ({ page }) => {
    await page.goto('/debug')
    await page.locator('#files button[data-file="data/races.json"]').click()
    const view = page.locator('#file-view')
    await expect(view).toHaveAttribute('open', '')
    await expect(view.locator('#file-view-path')).toHaveText('data/races.json')
    await expect(view.locator('#file-view-body')).toContainText('e2e-10k')
    await expect(view.locator('#file-view-note')).toBeHidden()
    await view.locator('#file-view-close').click()
    await expect(view).not.toHaveAttribute('open', '')

    await page.locator('#files button[data-file=".coros/auth.json"]').click()
    await expect(view.locator('#file-view-note')).toBeVisible()
    await expect(view.locator('#file-view-body')).toContainText('"hasTokens": true')
    await expect(view.locator('#file-view-body')).not.toContainText('e2e-fake-token')
  })

  test('vaciar trazas deja solo la traza del reset', async ({ page }) => {
    await page.goto('/debug')
    await page.locator('#clear-traces').click()
    await expect(page.locator('#flash')).toHaveText('Trazas vaciadas.')
    await expect(page.locator('#traces li.tr')).toHaveCount(1)
    await expect(page.locator('#traces li.tr .scope')).toHaveText('reset')
  })

  test.describe('Borrar todo', () => {
    // Deja el sandbox como al principio para los tests que vienen detrás
    test.afterAll(() => {
      seedAuth()
      seedRaces()
    })

    test('borra data/, .coros/ y el estado en memoria', async ({ page, request }) => {
      await page.goto('/debug')
      page.once('dialog', (dialog) => dialog.accept())
      await page.locator('#wipe').click()

      await expect(page.locator('#flash')).toContainText('Borrado:')
      await expect(page.locator('#flash')).toContainText('data/races.json')
      await expect(page.locator('#flash')).toContainText('.coros/')
      await expect(page.locator('#runtime')).toContainText('off')
      await expect(page.locator('#runtime')).toContainText('sin sesión')
      await expect(page.locator('#files li', { hasText: 'data/briefing.json' })).toHaveClass(/empty/)

      // Sin COROS la API se cierra
      expect((await request.get('/api/briefing')).status()).toBe(401)
      const snapshot = (await (await request.get('/api/debug')).json()) as { runtime: { corosConnected: boolean; chatAgent: boolean } }
      expect(snapshot.runtime).toMatchObject({ corosConnected: false, chatAgent: false })
    })
  })
})
