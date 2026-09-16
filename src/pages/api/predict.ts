import type { APIRoute } from 'astro'

import { streamPrediction } from '../../agent/swarm'
import { ndjson, requireCoros } from '../../lib/api'
import { getRaces } from '../../lib/races'

export const prerender = false

interface PredictBody {
  raceId?: string
}

/**
 * POST /api/predict
 * Body: { raceId }
 *
 * Lanza el enjambre de predicción. Respuesta en streaming NDJSON: una línea JSON por evento.
 * Tipos de evento: node_start, tool_start, tool_end, handoff, result, error.
 */
export const POST: APIRoute = async ({ request }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const body = (await request.json().catch(() => ({}))) as PredictBody

  if (!body.raceId) {
    return Response.json({ error: 'Falta raceId' }, { status: 400 })
  }

  const { races } = await getRaces()
  const race = races.find((candidate) => candidate.id === body.raceId)

  if (!race) {
    return Response.json({ error: `Carrera ${body.raceId} no encontrada` }, { status: 404 })
  }

  return ndjson(streamPrediction(race))
}
