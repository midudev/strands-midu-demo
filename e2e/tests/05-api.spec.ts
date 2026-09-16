import { expect, ndjson, test } from '../fixtures'

test.describe('API (sin navegador)', () => {
  test('GET /api/team lista el equipo con avatar', async ({ request }) => {
    const res = await request.get('/api/team')
    expect(res.ok()).toBe(true)
    const team = (await res.json()) as { id: string; nombre: string; avatar: string }[]
    expect(team.map((s) => s.id)).toEqual(['entrenador', 'fisio', 'nutricionista'])
    expect(team[1]).toMatchObject({ nombre: 'Fisioterapeuta', avatar: '/team/fisio.webp' })
  })

  test('GET /api/team?who= valida especialista y run', async ({ request }) => {
    expect((await request.get('/api/team?who=nadie')).status()).toBe(404)
    expect((await request.get('/api/team?who=fisio&run=abc')).status()).toBe(400)
  })

  test('GET /api/team?who=fisio&cached devuelve idle si no hay opinión guardada para esa sesión', async ({ request }) => {
    const res = await request.get('/api/team?who=nutricionista&run=900000000000000002&cached')
    expect(res.headers()['content-type']).toContain('application/x-ndjson')
    expect(await ndjson(await res.text())).toEqual([{ type: 'idle' }])
  })

  test('GET /api/team?who=nutricionista opina en NDJSON: tool, texto y done', async ({ request }) => {
    const res = await request.get('/api/team?who=nutricionista&refresh')
    const events = await ndjson(await res.text())
    expect(events[0]).toEqual({ type: 'tool', name: 'querySportRecords' })
    expect(events.filter((e) => e.type === 'text').length).toBeGreaterThan(1)
    const done = events.at(-1) as { type: string; cache: boolean; take: { toolsUsadas: string[]; opinion: string } }
    expect(done.type).toBe('done')
    expect(done.cache).toBe(false)
    expect(done.take.toolsUsadas).toEqual(['querySportRecords'])
    expect(done.take.opinion).toContain('nutricionista')
  })

  test('POST /api/chat valida el body y responde NDJSON', async ({ request }) => {
    expect((await request.post('/api/chat', { data: {} })).status()).toBe(400)
    expect((await request.post('/api/chat', { data: { message: '   ' } })).status()).toBe(400)
    expect((await request.post('/api/chat', { data: { message: 'hola', runId: 'abc' } })).status()).toBe(400)

    const res = await request.post('/api/chat', { data: { message: 'ping desde la API' } })
    expect(res.headers()['content-type']).toContain('application/x-ndjson')
    const events = await ndjson(await res.text())
    expect(events.filter((e) => e.type === 'text').map((e) => e.text).join('')).toBe('Respuesta del coach (mock): ping desde la API')
    expect(events.at(-2)).toMatchObject({ type: 'context', context: { manager: 'sliding-window', sessionId: 'coach-chat', ventana: 12 } })
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  test('GET /api/context devuelve la ventana y el historial legible', async ({ request }) => {
    const res = await request.get('/api/context')
    const body = (await res.json()) as { manager: string; historial: { role: string; text: string }[] }
    expect(body.manager).toBe('sliding-window')
    expect(body.historial.some((m) => m.role === 'user' && m.text === 'ping desde la API')).toBe(true)
  })

  test('GET /api/brain: estado, sesión y memoria', async ({ request }) => {
    const res = await request.get('/api/brain')
    const body = (await res.json()) as { estado: { turnos: number }; sesion: { id: string; ruta: string }; memoria: { ruta: string } }
    expect(body.estado.turnos).toBeGreaterThan(0)
    expect(body.sesion).toMatchObject({ id: 'coach-chat', ruta: 'data/strands/sessions/coach-chat' })
    expect(body.memoria.ruta).toBe('data/strands/memory/midu')
  })

  test('GET /api/briefing cachea por día y GET /api/races trae carreras y predicciones', async ({ request }) => {
    const briefing = (await (await request.get('/api/briefing')).json()) as { fecha: string; semana: unknown[]; toolsUsadas: string[] }
    expect(briefing.fecha).toBe(new Date().toISOString().slice(0, 10))
    expect(briefing.semana).toHaveLength(7)
    expect(briefing.toolsUsadas).toEqual(['queryTrainingLoadAssessment'])

    const races = (await (await request.get('/api/races')).json()) as { fetchedAt: string; races: { id: string }[]; predicciones: object }
    expect(races.races.map((r) => r.id)).toEqual(['e2e-10k', 'e2e-mitja', 'e2e-trail'])
    expect(races.predicciones).toBeDefined()
  })

  test('GET /api/debug: snapshot del servidor y lectura segura de ficheros', async ({ request }) => {
    const snapshot = (await (await request.get('/api/debug')).json()) as {
      runtime: { model: string; corosConnected: boolean; chatAgent: boolean }
      files: { path: string; exists: boolean }[]
      traces: { scope: string }[]
    }
    expect(snapshot.runtime).toMatchObject({ model: 'fake-model', corosConnected: true, chatAgent: true })
    expect(snapshot.files.find((f) => f.path === 'data/races.json')?.exists).toBe(true)
    expect(snapshot.traces.some((t) => t.scope === 'http')).toBe(true)

    const file = (await (await request.get('/api/debug?file=data/races.json')).json()) as { sanitized: boolean; content: { races: unknown[] } }
    expect(file.sanitized).toBe(false)
    expect(file.content.races).toHaveLength(3)

    // El fichero de auth sale sanitizado: nunca viaja el token
    const auth = await request.get('/api/debug?file=.coros/auth.json')
    const authText = await auth.text()
    expect(auth.ok()).toBe(true)
    expect(JSON.parse(authText)).toMatchObject({ sanitized: true, content: { hasTokens: true, tokenType: 'bearer' } })
    expect(authText).not.toContain('e2e-fake-token')

    // Nada fuera de la lista blanca
    expect((await request.get('/api/debug?file=../package.json')).status()).toBe(404)
    expect((await request.get('/api/debug?file=/etc/passwd')).status()).toBe(404)
    expect((await request.get('/api/debug?file=package.json')).status()).toBe(404)
  })

  test('POST /api/debug clear-traces vacía las trazas', async ({ request }) => {
    const res = await request.post('/api/debug', { data: { action: 'clear-traces' } })
    const body = (await res.json()) as { tracesMeta: { count: number }; traces: { scope: string }[] }
    expect(body.tracesMeta.count).toBe(1)
    expect(body.traces[0]?.scope).toBe('reset')
  })

  test('la página de slides es estática y carga', async ({ request }) => {
    const res = await request.get('/slides')
    expect(res.ok()).toBe(true)
    expect(await res.text()).toContain('Strands')
  })
})
