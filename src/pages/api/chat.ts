import type { APIRoute } from 'astro'

import { streamChat } from '../../agent/chat'
import { ndjson, requireCoros, requireRunner, runIdOf } from '../../lib/api'

export const prerender = false

interface ChatBody {
  message?: string
  /** Si viene, el chat es sobre una sesión concreta (/runs/:id) */
  runId?: string
  /** "onboarding": la conversación de bienvenida que monta el perfil del corredor */
  kind?: string
}

/**
 * POST /api/chat
 * Body: { message, runId?, kind? }
 *
 * Respuesta en streaming NDJSON: una línea JSON por evento.
 * Tipos de evento: text, tool_start, tool_end, agent_start, agent_text, agent_end, context, profile, done.
 */
export const POST: APIRoute = async ({ request }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const body = (await request.json().catch(() => ({}))) as ChatBody
  const message = body.message?.trim()
  const onboarding = body.kind === 'onboarding'

  if (!message) {
    return Response.json({ error: 'Falta message' }, { status: 400 })
  }

  if (body.runId && !runIdOf(body.runId)) {
    return Response.json({ error: 'runId inválido' }, { status: 400 })
  }

  // El coach y los chats de sesión necesitan el perfil; la bienvenida es justo lo que lo crea
  if (!onboarding) {
    const noRunner = requireRunner()
    if (noRunner) return noRunner
  }

  return ndjson(streamChat(message, { runId: body.runId, onboarding }))
}
