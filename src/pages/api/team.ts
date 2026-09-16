import type { APIRoute } from 'astro'

import { isSpecialist, SPECIALISTS } from '../../agent/prompts/team'
import { streamSpecialistTake } from '../../agent/team'
import { ndjson, requireCoros, runIdOf } from '../../lib/api'

export const prerender = false

/**
 * GET /api/team
 *   Sin parámetros: lista del equipo (id, nombre, descripción, avatar).
 *
 * GET /api/team?who=fisio[&refresh][&run=<id>][&cached]
 *   Opinión de un especialista en streaming NDJSON (eventos: tool, text, done, idle).
 *   - refresh: ignora la caché y vuelve a generar.
 *   - run: opina sobre esa sesión concreta en vez de sobre el día.
 *   - cached: solo devuelve lo que ya haya guardado; si no hay nada, responde "idle".
 */
export const GET: APIRoute = async ({ url }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const who = url.searchParams.get('who')

  if (!who) {
    const team = SPECIALISTS.map(({ id, nombre, descripcion, avatar }) => ({ id, nombre, descripcion, avatar }))
    return Response.json(team)
  }

  if (!isSpecialist(who)) {
    return Response.json({ error: `Especialista ${who} no existe` }, { status: 404 })
  }

  const runParam = url.searchParams.get('run')

  if (runParam && !runIdOf(runParam)) {
    return Response.json({ error: 'run inválido' }, { status: 400 })
  }

  const options = {
    refresh: url.searchParams.has('refresh'),
    runId: runIdOf(runParam),
    cachedOnly: url.searchParams.has('cached'),
  }

  return ndjson(streamSpecialistTake(who, options))
}
