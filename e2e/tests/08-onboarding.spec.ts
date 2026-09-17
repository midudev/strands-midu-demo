import { seedRunner } from '../fakes/sandbox'
import { expect, test } from '../fixtures'

test.describe('Bienvenida: el perfil del corredor', () => {
  // Deja el perfil de siempre para cualquier test que venga detrás
  test.afterAll(() => seedRunner())

  test('sin perfil, la portada enseña la entrevista y la API del coach se cierra', async ({ page, request }) => {
    expect((await request.get('/api/runner')).ok()).toBe(true)
    // data: {} manda JSON: sin content-type de formulario, Astro no aplica la protección CSRF de origen cruzado
    const wiped = await request.delete('/api/runner', { data: {} })
    expect(await wiped.json()).toEqual({ ok: true, wiped: true })
    expect((await request.get('/api/runner')).status()).toBe(404)

    for (const path of ['/api/briefing', '/api/brain', '/api/races', '/api/context', '/api/team']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(409)
      expect(await res.json()).toEqual({ error: 'Falta el perfil del corredor' })
    }
    expect((await request.post('/api/chat', { data: { message: 'hola' } })).status()).toBe(409)

    await page.goto('/')
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'onboarding')
    await expect(page.locator('#onboarding h1')).toContainText('cuéntame de ti')
    await expect(page.locator('#chat')).toHaveAttribute('data-kind', 'onboarding')
    await expect(page.locator('#chat-log .opener .body')).toContainText('¿Cómo te llamas y qué carrera estás preparando?')
    await expect(page.locator('.stats')).toHaveCount(0)

    // El detalle de una sesión también manda a la bienvenida
    await page.goto('/runs/900000000000000001')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'onboarding')
  })

  test('la entrevista guarda el perfil con guardar_perfil y la portada se monta con el nuevo objetivo', async ({ page, request }) => {
    await page.goto('/')
    await expect(page.locator('#chat-ctx .ctx-text')).toHaveText(/contexto · \d+\/40 msgs · ventana deslizante/)

    await page.fill('#chat-input', 'hola')
    await page.press('#chat-input', 'Enter')
    await expect(page.locator('#chat-log .msg.bot').last().locator('.body')).toHaveText('Encantado. ¿Cómo te llamas y qué carrera preparas?')
    await expect(page.locator('#chat-form button[type="submit"]')).toBeEnabled()
    expect((await request.get('/api/runner')).status()).toBe(404)

    await page.fill('#chat-input', 'Me llamo Ana, preparo la media de Barcelona y quiero bajar de 1:45')
    await page.press('#chat-input', 'Enter')

    await expect(page.locator('#chat-log .tool.done .name').last()).toHaveText('Guardar perfil del corredor')
    await expect(page.locator('#chat-log .msg.bot').last().locator('.body')).toContainText('Ya tengo todo para prepararte el panel')
    await expect(page.locator('#chat-log .profile-saved')).toContainText('Perfil de Ana guardado')

    // Redirige sola a la portada, ya en modo coach y con el objetivo de Ana
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'coach', { timeout: 10_000 })
    await expect(page.locator('header .runner .who')).toHaveText('Ana')
    await expect(page.locator('header .runner .goal')).toContainText('Mitja Marató de Barcelona')
    await expect(page.locator('.stats .target')).toHaveText('1:45:00')
    await expect(page.locator('.stats .huge')).toHaveText('1:21:00')
    await expect(page.locator('.stats .days')).toContainText('días para Mitja Marató de Barcelona')
    await expect(page.locator('#chat .chips')).toContainText('Mitja Marató de Barcelona')

    const runner = (await (await request.get('/api/runner')).json()) as { nombre: string; diasPorSemana: number; notas: string[] }
    expect(runner).toMatchObject({ nombre: 'Ana', diasPorSemana: 4 })
    expect(runner.notas[0]).toContain('sóleo')

    // El coach nuevo habla con el perfil nuevo: la sesión antigua del chat sigue en disco pero el agente se ha reconstruido
    await page.fill('#chat-input', 'hola coach')
    await page.press('#chat-input', 'Enter')
    await expect(page.locator('#chat-log .msg.bot').last().locator('.body')).toHaveText('Respuesta del coach (mock): hola coach')
  })

  test('"cambiar" en la cabecera borra el perfil y vuelve a la bienvenida en blanco', async ({ page }) => {
    await page.goto('/')
    await page.locator('header .runner .change').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('main.app')).toHaveAttribute('data-mode', 'onboarding')
    await expect(page.locator('#chat-log .opener')).toBeVisible()
    await expect(page.locator('#chat-log .msg.user')).toHaveCount(0)
  })
})
