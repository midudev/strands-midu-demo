import { seedAuth } from '../fakes/sandbox'
import { expect, test } from '../fixtures'

test.describe('Conexión con COROS', () => {
  test.afterAll(() => seedAuth())

  test('desconectar vuelve a la portada de bienvenida y cierra la API', async ({ page, request }) => {
    await page.goto('/')
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'coach')

    await page.getByRole('button', { name: 'Desconectar' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'hero')
    await expect(page.locator('#hero h1')).toContainText('Tu reloj sabe')
    await expect(page.locator('#hero .cta a.btn')).toHaveAttribute('href', '/api/auth/coros/login')
    await expect(page.locator('header nav a.btn')).toHaveText(/Conectar COROS/)
    await expect(page.locator('#chat')).toHaveCount(0)

    for (const path of ['/api/briefing', '/api/brain', '/api/races', '/api/context', '/api/team']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(401)
      expect(await res.json()).toEqual({ error: 'COROS no conectado' })
    }
    expect((await request.post('/api/chat', { data: { message: 'hola' } })).status()).toBe(401)
    expect((await request.post('/api/predict', { data: { raceId: 'e2e-10k' } })).status()).toBe(401)

    // Y el detalle de una sesión manda a la portada
    await page.goto('/runs/900000000000000001')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'hero')
  })

  test('el callback OAuth rechaza un state incorrecto y avisa en la portada', async ({ page }) => {
    await page.goto('/api/auth/coros/callback?code=abc&state=malo')
    await expect(page).toHaveURL(/\/\?coros=error&motivo=state$/)
    await expect(page.locator('.flash.warn')).toHaveText('No se pudo conectar con COROS (state). Prueba de nuevo.')
  })

  test('el callback OAuth sin código o con error de COROS vuelve con el motivo', async ({ page }) => {
    await page.goto('/api/auth/coros/callback?state=x')
    await expect(page).toHaveURL(/coros=error&motivo=sin%20code$/)

    await page.goto('/api/auth/coros/callback?error=access_denied')
    await expect(page).toHaveURL(/coros=error&motivo=access_denied$/)
    await expect(page.locator('.flash.warn')).toContainText('access_denied')
  })

  test('al volver a haber tokens, la portada vuelve al modo coach', async ({ page }) => {
    seedAuth()
    await page.goto('/')
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'coach')
    await expect(page.getByRole('button', { name: 'Desconectar' })).toBeVisible()
  })
})
