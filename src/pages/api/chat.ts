import type { APIRoute } from 'astro'

import { streamChat } from '../../agent/chat'
import { ndjson, requireCoros, runIdOf } from '../../lib/api'

export const prerender = false

interface ChatBody {
  message?: string
  /** Si viene, el chat es sobre una sesión concreta (/runs/:id) */
  runId?: string
}

/**
 * POST /api/chat
 * Body: { message, runId? }
 *
 * Respuesta en streaming NDJSON: una línea JSON por evento.
 * Tipos de evento: text, tool_start, tool_end, agent_start, agent_text, agent_end, context, done.
 */
export const POST: APIRoute = async ({ request }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const body = (await request.json().catch(() => ({}))) as ChatBody
  const message = body.message?.trim()

  if (!message) {
    return Response.json({ error: 'Falta message' }, { status: 400 })
  }

  if (body.runId && !runIdOf(body.runId)) {
    return Response.json({ error: 'runId inválido' }, { status: 400 })
  }

  return ndjson(streamChat(message, { runId: body.runId }))
}
