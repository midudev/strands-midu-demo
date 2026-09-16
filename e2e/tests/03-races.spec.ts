import { expect, test } from '../fixtures'

test.describe('Predicción de carreras con el enjambre', () => {
  test('el enjambre pasa el testigo en vivo y guarda la predicción', async ({ page }) => {
    await page.goto('/')
    const race = page.locator('.race[data-race-id="e2e-10k"]')
    const box = race.locator('.prediction')

    await expect(box).toHaveAttribute('data-state', 'idle')
    await race.locator('.predict').click()

    // Panel del enjambre: los cuatro agentes y los pasos en vivo
    await expect(race.locator('.swarm .node')).toHaveCount(4)
    await expect(box).toHaveAttribute('data-state', 'ready', { timeout: 15_000 })

    await expect(box.locator('.time')).toContainText('38:00')
    await expect(box.locator('.time')).toContainText('3:48/km · 10K')
    await expect(box.locator('.tag')).toHaveText('Tempo')
    await expect(box.locator('.reco')).toContainText('Predicción de prueba')
    await expect(box.locator('.claves')).toContainText('Salir conservador · Negative split · Gel en el km 6')
    await expect(box.locator('.tools')).toContainText('CONFIANZA MEDIA')
    await expect(box.locator('.tools')).toContainText('queryFitnessAssessmentOverview')

    // Recorrido: analista → optimista → conservador → árbitro, con sus tools y handoffs
    const log = box.locator('details.swarm-log')
    await expect(log).toHaveAttribute('open', '')
    await expect(log.locator('summary')).toContainText('Cómo lo decidió el enjambre · 4 pasos')
    const steps = log.locator('.steps .step')
    await expect(steps).toHaveCount(4)
    await expect(steps).toHaveClass([/done/, /done/, /done/, /done/])
    await expect(steps.nth(0).locator('.who')).toHaveText('1. Analista')
    await expect(steps.nth(0).locator('.tool-row .chip')).toHaveText([/Fitness · \d+/, /Carrera · \d+/])
    await expect(steps.nth(0).locator('.msg')).toContainText('COROS estima 37:30')
    await expect(steps.nth(0).locator('.ctx')).toContainText('prediccionCoros')
    await expect(steps.nth(0).locator('.next')).toHaveText('→ Optimista')
    await expect(steps.nth(3).locator('.who')).toHaveText('4. Árbitro')
    await expect(steps.nth(3).locator('.tool-row .chip')).toHaveText([/Guardar predicción · \d+/])
    await expect(steps.nth(3).locator('.next')).toHaveText('■ fin')

    await expect(race.locator('.predict')).toHaveText('Repredecir')
    await expect(race.locator('.predict')).toBeEnabled()
  })

  test('la predicción queda guardada: se pinta en el servidor al recargar y sale por la API', async ({ page, request }) => {
    await page.goto('/')
    const race = page.locator('.race[data-race-id="e2e-10k"]')
    const box = race.locator('.prediction')

    await expect(box).toHaveAttribute('data-state', 'ready')
    await expect(box.locator('.time')).toContainText('38:00')
    await expect(box.locator('details.swarm-log summary')).toContainText('4 pasos')
    await expect(box.locator('.steps .step')).toHaveCount(4)
    await expect(box.locator('.steps .step').last().locator('.next')).toHaveText('■ fin')
    await expect(race.locator('.predict')).toHaveText('Repredecir')

    // La otra carrera sigue sin predicción
    await expect(page.locator('.race[data-race-id="e2e-mitja"] .prediction')).toHaveAttribute('data-state', 'idle')
    await expect(page.locator('.race[data-race-id="e2e-mitja"] .predict')).toHaveText('Predecir')

    const res = await request.get('/api/races')
    expect(res.ok()).toBe(true)
    const body = (await res.json()) as { races: unknown[]; predicciones: Record<string, { tiempoEstimado: string; swarm?: unknown[] }> }
    expect(body.races).toHaveLength(3)
    expect(body.predicciones['e2e-10k']?.tiempoEstimado).toBe('38:00')
    expect(body.predicciones['e2e-10k']?.swarm).toHaveLength(4)
  })

  test('la API de predicción valida la carrera', async ({ request }) => {
    const missing = await request.post('/api/predict', { data: {} })
    expect(missing.status()).toBe(400)
    expect(await missing.json()).toEqual({ error: 'Falta raceId' })

    const unknown = await request.post('/api/predict', { data: { raceId: 'nope' } })
    expect(unknown.status()).toBe(404)
    expect(await unknown.json()).toEqual({ error: 'Carrera nope no encontrada' })
  })
})
