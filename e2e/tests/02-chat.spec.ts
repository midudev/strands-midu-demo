import type { Page } from '@playwright/test'

import { expect, test } from '../fixtures'

/** Envía un mensaje y espera a que el turno termine (el botón de enviar se reactiva al acabar el stream). */
async function send(page: Page, message: string) {
  const before = await page.locator('#chat-log .msg.user').count()
  await page.fill('#chat-input', message)
  await page.press('#chat-input', 'Enter')
  await expect(page.locator('#chat-log .msg.user')).toHaveCount(before + 1)
  await expect(page.locator('#chat-form button[type="submit"]')).toBeEnabled()
}

const lastBot = (page: Page) => page.locator('#chat-log .msg.bot').last()

test.describe('Chat con el coach (portada)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#chat-ctx .ctx-text')).toContainText('contexto ·')
  })

  test('responde en streaming con la cara del entrenador y enseña la ventana de contexto', async ({ page }) => {
    await expect(page.locator('#chat-log .hint')).toBeVisible()
    await send(page, 'hola coach')

    await expect(page.locator('#chat-log .hint')).toHaveCount(0)
    await expect(page.locator('#chat-log .msg.user').last()).toHaveText('hola coach')
    await expect(lastBot(page).locator('.who')).toHaveText('Entrenador')
    await expect(lastBot(page).locator('.body')).toHaveText('Respuesta del coach (mock): hola coach')
    await expect(lastBot(page)).not.toHaveClass(/streaming/)
    await expect(page.locator('#chat-log .think')).toHaveCount(0)

    await expect(page.locator('#chat-ctx .ctx-text')).toHaveText(/contexto · \d+\/12 msgs · ventana deslizante/)
  })

  test('las tools se pintan con su nombre, duración, entrada y resultado', async ({ page }) => {
    await send(page, '¿Cómo van mis entrenos?')

    const tool = page.locator('#chat-log .tool.done').last()
    await expect(tool.locator('.name')).toHaveText('Entrenamientos')
    await expect(tool.locator('.ms')).toHaveText(/\d+(ms|\.\ds)/)
    await expect(tool).toHaveClass(/has-out/)

    await tool.locator('.row').click()
    await expect(tool).toHaveClass(/open/)
    await expect(tool.locator('.io pre').first()).toContainText('sportTypeCodes')
    await expect(tool.locator('.io pre').last()).toContainText('LabelId: 900000000000000001')

    await expect(lastBot(page).locator('.body')).toContainText('He mirado tus entrenos')
  })

  test('delega en el fisio (agent as tool) y lo pinta con su propia cara y sus tools', async ({ page }) => {
    await send(page, 'Tengo una molestia en la rodilla')

    const agent = page.locator('#chat-log .agent').last()
    await expect(agent).toHaveClass(/done/)
    await expect(agent.locator('.agent-head .who')).toHaveText('Fisioterapeuta')
    await expect(agent.locator('.agent-head img.avatar')).toHaveAttribute('src', '/team/fisio.webp')
    await expect(agent.locator('.ask')).toContainText('molestia en la rodilla')
    await expect(agent.locator('.tools.sub .tool.done .name')).toHaveText('Recuperación')
    await expect(agent.locator('.say')).toContainText('Opinión de prueba del fisioterapeuta')
    // El markdown del especialista llega sin asteriscos al chat
    await expect(agent.locator('.say')).not.toContainText('**')

    // El coach solo remata: no repite lo del fisio
    await expect(lastBot(page).locator('.body')).toHaveText('Ahí lo tienes: hoy trote suave y mañana vemos.')
  })

  test('la memoria a largo plazo aprende de la conversación (extracción en segundo plano)', async ({ page, request }) => {
    await expect
      .poll(
        async () => {
          const res = await request.get('/api/brain')
          const body = (await res.json()) as { memoria: { entradas: { titulo: string; hechos: string[] }[] } }
          return body.memoria.entradas.map((e) => `${e.titulo}: ${e.hechos.join(' ')}`).join('\n')
        },
        { timeout: 10_000 },
      )
      .toContain('Lesiones y molestias: Molestia en la rodilla izquierda (mock).')

    await page.locator('#brain-toggle').click()
    await expect(page.locator('#brain-memory .entry h4')).toContainText('Lesiones y molestias')
    await expect(page.locator('#brain-memory .entry li')).toContainText('rodilla')
  })

  test('guarda preferencias en el estado del agente (appState), fuera del contexto del modelo', async ({ page }) => {
    await send(page, 'Mi tirada larga es el domingo')

    await expect(page.locator('#chat-log .tool.done .name').last()).toHaveText('Guardar preferencia (estado)')
    await expect(lastBot(page).locator('.body')).toContainText('tirada larga es el domingo')

    await page.locator('#brain-toggle').click()
    await expect(page.locator('#brain-prefs li').first()).not.toHaveClass(/empty/)
    await expect(page.locator('#brain-prefs')).toContainText('dia_tirada_larga')
    await expect(page.locator('#brain-prefs')).toContainText('domingo')
    await expect(page.locator('#brain-state')).not.toContainText('turnos…')
  })

  test('un fallo del modelo se muestra en el chat sin romperlo', async ({ page }) => {
    await send(page, 'provoca un error')
    await expect(lastBot(page).locator('.body')).toContainText('[error] Fallo simulado del modelo')

    await send(page, 'sigo aquí')
    await expect(lastBot(page).locator('.body')).toHaveText('Respuesta del coach (mock): sigo aquí')
  })

  test('la ventana deslizante deja fuera los mensajes antiguos y lo avisa', async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await send(page, `mensaje ${i}`)
      if ((await page.locator('#chat-log .ctx-note', { hasText: 'Ventana deslizante' }).count()) > 0) break
    }
    await expect(page.locator('#chat-log .ctx-note', { hasText: 'Ventana deslizante' }).first()).toContainText(/\d+ mensajes? antiguos? fuera del contexto/)
    // La ventana nunca supera su tamaño
    const ctx = await page.locator('#chat-ctx .ctx-text').textContent()
    const [, mensajes] = /contexto · (\d+)\/12 msgs/.exec(ctx ?? '') ?? []
    expect(Number(mensajes)).toBeLessThanOrEqual(12)
  })

  test('la sesión se restaura del disco al recargar (SessionManager)', async ({ page }) => {
    await expect(page.locator('#chat-log .ctx-note.restored')).toContainText(/Sesión coach-chat restaurada de disco · \d+ mensajes/)
    await expect(page.locator('#chat-log .hint')).toHaveCount(0)
    expect(await page.locator('#chat-log .msg.user').count()).toBeGreaterThan(0)
    expect(await page.locator('#chat-log .msg.bot').count()).toBeGreaterThan(0)
  })

  test('el botón de contexto fuerza el recorte del historial', async ({ page }) => {
    await page.locator('#chat-ctx').click()
    await expect(page.locator('#chat-log .ctx-note').last()).toHaveText(/Historial recortado: \d+ → \d+ mensajes\.|Nada que recortar \(\d+ mensajes\)\./)
    await expect(page.locator('#chat-ctx')).toBeEnabled()
  })

  test('los chips de sugerencias envían el mensaje', async ({ page }) => {
    const chip = page.locator('#chat .chips .chip').first()
    const text = (await chip.textContent())!.trim()
    await chip.click()
    await expect(page.locator('#chat-log .msg.user').last()).toHaveText(text)
    await expect(page.locator('#chat-form button[type="submit"]')).toBeEnabled()
    await expect(lastBot(page).locator('.body')).not.toBeEmpty()
  })
})
