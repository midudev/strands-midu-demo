import type { APIRoute } from 'astro'

import { compressContext, getContext } from '../../agent/chat'
import { apiError, requireCoros, runIdOf } from '../../lib/api'

export const prerender = false

interface ContextBody {
  runId?: string
}

/**
 * GET /api/context[?runId=<id>]
 *
 * Estado de la ventana de conversación del chat: qué ConversationManager usa,
 * cuántos mensajes hay, el resumen activo (si lo hay) y el historial legible.
 */
export const GET: APIRoute = async ({ url }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const runId = runIdOf(url.searchParams.get('runId'))

  try {
    return Response.json(await getContext({ runId }))
  } catch (err) {
    return apiError(err)
  }
}

/**
 * POST /api/context
 * Body: { runId? }
 *
 * Fuerza la reducción del historial: lo que el ConversationManager haría solo al llenarse el contexto.
 * Sirve para verlo en el taller sin esperar a que la ventana se llene.
 */
export const POST: APIRoute = async ({ request }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const body = (await request.json().catch(() => ({}))) as ContextBody
  const runId = runIdOf(body.runId)

  try {
    return Response.json(await compressContext({ runId }))
  } catch (err) {
    return apiError(err)
  }
}
