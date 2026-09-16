import type { Page } from '@playwright/test'

import { RUNS, TRACKED_RUN_ID } from '../fakes/sandbox'
import { expect, test } from '../fixtures'

async function send(page: Page, message: string) {
  const before = await page.locator('#chat-log .msg.user').count()
  await page.fill('#chat-input', message)
  await page.press('#chat-input', 'Enter')
  await expect(page.locator('#chat-log .msg.user')).toHaveCount(before + 1)
  await expect(page.locator('#chat-form button[type="submit"]')).toBeEnabled()
}

test.describe('Detalle de una sesión (/runs/:id)', () => {
  test('pinta métricas, mapa, gráficas y vueltas a partir de COROS', async ({ page }) => {
    await page.goto(`/runs/${TRACKED_RUN_ID}`)

    await expect(page).toHaveTitle(/Outdoor Run · .* · midu.run/)
    await expect(page.locator('.run h1')).toHaveText('Outdoor Run')
    await expect(page.locator('.run .place')).toHaveText('Barcelona')
    await expect(page.locator('.run .label').first()).toContainText('COROS')

    const hero = page.locator('.run .hero li')
    await expect(hero).toHaveCount(4)
    const heroText = page.locator('.run .hero')
    for (const value of ['11.0', '56:57', '5:10', '123']) await expect(heroText).toContainText(value)

    // Extra: métricas de getActivityDetail
    const extra = page.locator('.run ul.extra').first()
    for (const value of ['172', '280', '+64', '88', '4:41', '618']) await expect(extra).toContainText(value)
    await expect(page.locator('.run .insights')).toContainText('Base')
    await expect(page.locator('.run .insights')).toContainText('Por encima')

    // Recorrido cacheado (el mapa externo está bloqueado en los tests, solo comprobamos el contenedor)
    await expect(page.locator('#run-map')).toBeAttached()
    expect(JSON.parse((await page.locator('#run-map').getAttribute('data-track'))!)).toHaveLength(20)

    // Gráficas SVG de ritmo y FC
    await expect(page.locator('#run-charts svg').first()).toBeAttached()
    expect(await page.locator('#run-charts svg').count()).toBeGreaterThanOrEqual(1)

    // Vueltas: 10 de 1 km (el parcial residual de 10 m se descarta), con la rápida marcada
    const laps = page.locator('.laps li')
    await expect(laps).toHaveCount(10)
    await expect(laps.first().locator('.km')).toContainText('1.00')
    await expect(laps.first().locator('.pace')).toContainText('5:10')
    await expect(laps.first().locator('.hr')).toContainText('118')

    await expect(page.getByRole('link', { name: '← Entrenamientos' })).toHaveAttribute('href', '/')
  })

  test('el entrenador opina sobre la sesión bajo demanda y su opinión se cachea', async ({ page }) => {
    await page.goto(`/runs/${TRACKED_RUN_ID}`)
    const team = page.locator('#team')
    await expect(team).toHaveAttribute('data-run', TRACKED_RUN_ID)

    const row = team.locator('.row[data-id="entrenador"]')
    await expect(team.locator('.row')).toHaveCount(1)
    await expect(row).toHaveAttribute('data-state', 'idle')
    await expect(row.locator('.ask')).toBeVisible()

    await row.locator('.ask').click()
    await expect(row).toHaveAttribute('data-state', 'ready')
    await expect(row.locator('.opinion')).toContainText('Opinión de prueba del entrenador')
    await expect(team.locator('#team-refresh')).toHaveText('Regenerar')

    await page.reload()
    await expect(row).toHaveAttribute('data-state', 'ready')
    await expect(row.locator('.ms')).toContainText('guardada')
  })

  test('el chat de la sesión usa un ConversationManager con resumen', async ({ page }) => {
    await page.goto(`/runs/${TRACKED_RUN_ID}`)
    await expect(page.locator('#chat')).toHaveAttribute('data-run-id', TRACKED_RUN_ID)
    await expect(page.locator('#chat-ctx .ctx-text')).toHaveText(/contexto · \d+ msgs · resumen/)
    await expect(page.locator('#chat .chips .chip').first()).toHaveText('¿Fue un ritmo sostenible?')

    await send(page, '¿Fue un ritmo sostenible?')
    await expect(page.locator('#chat-log .msg.bot').last().locator('.body')).toHaveText('Respuesta del coach (mock): ¿Fue un ritmo sostenible?')
    await send(page, '¿Qué dices de las vueltas?')
    await send(page, '¿Cómo encaja esto con Valencia?')

    // Forzar el recorte: lo viejo se resume con el modelo y el resumen se enseña
    await page.locator('#chat-ctx').click()
    await expect(page.locator('#chat-log .ctx-note').last()).toContainText('Historial resumido')
    await expect(page.locator('#chat-log .ctx-summary')).toContainText('Resumen de prueba')
    await expect(page.locator('#chat-ctx')).toHaveClass(/summary/)
    await expect(page.locator('#chat-ctx')).toHaveAttribute('title', /Resumen activo/)
  })

  test('otra sesión sin recorrido cacheado no pinta mapa pero sí el resto', async ({ page }) => {
    await page.goto(`/runs/${RUNS[2]!.id}`)
    await expect(page.locator('.run h1')).toHaveText('Outdoor Run')
    await expect(page.locator('.run .place')).toHaveText('Castelldefels')
    await expect(page.locator('#run-map')).toHaveCount(0)
    await expect(page.locator('.laps li')).toHaveCount(10)
  })

  test('ids inválidos o desconocidos redirigen a la portada', async ({ page }) => {
    await page.goto('/runs/abc')
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/runs/123456')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'coach')
  })
})
