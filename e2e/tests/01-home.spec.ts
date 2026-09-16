import { RUNS } from '../fakes/sandbox'
import { expect, test } from '../fixtures'

test.describe('Portada con COROS conectado', () => {
  test('pinta estado, forma, entrenos y carreras destacadas sin pasar por el LLM', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'coach')
    await expect(page.getByRole('button', { name: 'Desconectar' })).toBeVisible()
    await expect(page.locator('header .status')).toContainText('COROS')

    // Stats: predicción de maratón de COROS frente al objetivo 2:55
    const stats = page.locator('.stats')
    await expect(stats.locator('.huge')).toHaveText('2:52:00')
    await expect(stats.locator('.target')).toHaveText('2:55:00')
    await expect(stats.locator('.delta')).toContainText('por debajo del objetivo')
    await expect(stats.locator('.preds')).toContainText('17:58')
    await expect(stats.locator('.preds')).toContainText('3:46/km')
    await expect(stats.locator('.preds')).toContainText('58')
    await expect(stats.locator('.meters')).toContainText('100')
    await expect(stats.locator('.meters')).toContainText('Puedes entrenar fuerte')
    await expect(stats.locator('.meters')).toContainText('0.90')
    await expect(stats.locator('.meters')).toContainText('31.5')
    await expect(stats.locator('.meters')).toContainText('3 salidas esta semana')

    // Entrenos de la semana, con enlace a su detalle
    const runs = page.locator('.runs li')
    await expect(runs).toHaveCount(RUNS.length)
    await expect(runs.first().locator('a')).toHaveAttribute('href', `/runs/${RUNS[0]!.id}`)
    await expect(runs.first()).toContainText('11.0')
    await expect(runs.first()).toContainText('5:10')
    await expect(runs.first()).toContainText('123')
    await expect(runs.nth(2)).toContainText('Castelldefels')

    // Carreras: solo 5K/10K/media, ordenadas por fecha; la de trail se queda fuera
    const races = page.locator('.race')
    await expect(races).toHaveCount(2)
    await expect(races.nth(0)).toHaveAttribute('data-race-id', 'e2e-10k')
    await expect(races.nth(1)).toHaveAttribute('data-race-id', 'e2e-mitja')
    await expect(races.nth(0)).toContainText('10K · 5K')
    await expect(races.nth(0)).toContainText('inscripciones abiertas')
    await expect(races.nth(0).locator('.liga')).toBeVisible()
    await expect(races.nth(0).getByRole('link', { name: 'Cursa 10K de Prova' })).toHaveAttribute('href', 'https://xipgroc.cat/e2e-10k')
    await expect(page.locator('#races .updated')).toContainText('Actualizado')
    await expect(races.nth(0).locator('.predict')).toBeEnabled()
  })

  test('el briefing (structured output) se pinta y se puede regenerar', async ({ page }) => {
    await page.goto('/')
    const briefing = page.locator('#briefing')

    await expect(briefing.locator('.body')).toHaveAttribute('data-state', 'ready')
    await expect(briefing.locator('.titular')).toHaveText('Piernas frescas: hoy toca apretar un poco')
    await expect(briefing.locator('.motivo')).toContainText('Recuperación al 100%')
    await expect(briefing.locator('.semaforo')).toBeVisible()
    await expect(briefing.locator('.semaforo')).toHaveAttribute('data-tone', 'apretar')
    await expect(briefing.locator('.semaforo')).toContainText('Apretar')

    // Sesión de hoy: 3 bloques, 12 km
    await expect(briefing.locator('.nombre')).toHaveText('Bloque a ritmo de maratón')
    await expect(briefing.locator('.bloques li')).toHaveCount(3)
    await expect(briefing.locator('.bloques li').nth(1)).toContainText('Ritmo maratón')
    await expect(briefing.locator('.bloques li').nth(1)).toContainText('4:05–4:10')
    await expect(briefing.locator('.segments .seg')).toHaveCount(3)
    await expect(briefing.locator('.sesion .km')).toHaveText('12')

    // Semana: 7 columnas hechas (COROS) + 7 planificadas (coach), 71 km en total
    await expect(briefing.locator('.col.hecho')).toHaveCount(7)
    await expect(briefing.locator('.col.plan')).toHaveCount(7)
    await expect(briefing.locator('.col.plan.today .num')).toHaveText('12')
    await expect(briefing.locator('.col.plan .bar.tirada')).toHaveCount(1)
    await expect(briefing.locator('.km-semana')).toHaveText('71')
    await expect(briefing.locator('.tools')).toContainText('queryTrainingLoadAssessment')

    // Regenerar: vuelve a pedirlo con ?refresh y queda listo
    const refresh = page.waitForResponse((res) => res.url().includes('/api/briefing?refresh'))
    await briefing.locator('#briefing-refresh').click()
    expect((await refresh).ok()).toBe(true)
    await expect(briefing.locator('.body')).toHaveAttribute('data-state', 'ready')
    await expect(briefing.locator('.titular')).toHaveText('Piernas frescas: hoy toca apretar un poco')
  })

  test('el equipo opina en streaming y al recargar sale de la caché del día', async ({ page }) => {
    await page.goto('/')
    const rows = page.locator('#team .row')
    await expect(rows).toHaveCount(3)

    for (const id of ['entrenador', 'fisio', 'nutricionista']) {
      await expect(page.locator(`#team .row[data-id="${id}"]`)).toHaveAttribute('data-state', 'ready')
    }

    const fisio = page.locator('#team .row[data-id="fisio"]')
    await expect(fisio.locator('.who')).toHaveText('Fisioterapeuta')
    await expect(fisio.locator('.opinion')).toContainText('Opinión de prueba del fisioterapeuta')
    // Markdown mínimo: **negrita** y *cursiva* renderizados, en dos párrafos
    await expect(fisio.locator('.opinion strong')).toHaveText('bien')
    await expect(fisio.locator('.opinion em')).toHaveText('mantén')
    await expect(fisio.locator('.opinion p')).toHaveCount(2)
    await expect(fisio.locator('.thought')).toBeHidden()

    await page.reload()
    await expect(fisio).toHaveAttribute('data-state', 'ready')
    await expect(fisio.locator('.ms')).toContainText('hoy')
  })

  test('el cerebro del coach enseña estado del agente, sesión y memoria', async ({ page }) => {
    await page.goto('/')
    const brain = page.locator('#brain')

    await expect(brain.locator('#brain-cols')).toBeHidden()
    await brain.locator('#brain-toggle').click()
    await expect(brain.locator('#brain-cols')).toBeVisible()
    await expect(brain.locator('#brain-toggle')).toHaveText('ocultar')

    await expect(brain.locator('#brain-state')).toContainText('turnos')
    await expect(brain.locator('#brain-state')).toContainText('mensajes en sesión')
    await expect(brain.locator('#brain-session')).toContainText('data/strands/sessions/coach-chat')
    await expect(brain.locator('#brain-memory-path')).toContainText('data/strands/memory/midu')
  })

  test('sin JavaScript de más: la portada carga rápido y sin errores de consola', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await expect(page.locator('#briefing .body')).toHaveAttribute('data-state', 'ready')
    expect(errors).toEqual([])
  })
})
