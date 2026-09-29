import type { APIRoute } from 'astro'

import { compressContext, getContext, type ChatTarget } from '../../agent/chat'
import { workshop } from '../../agent/workshop'
import { apiError, requireCoros, requireRunner, runIdOf } from '../../lib/api'

export const prerender = false

interface ContextBody {
  runId?: string
  kind?: string
}

/** Qué chat se pide (portada, sesión o bienvenida), o la respuesta de error si aún no puede atenderse. */
function targetOf(runId: string | null | undefined, kind: string | null | undefined): ChatTarget | Response {
  if (kind === 'onboarding') return { onboarding: true }

  return requireRunner() ?? { runId: runIdOf(runId) }
}

/**
 * GET /api/context[?runId=<id>][&kind=onboarding]
 *
 * Estado de la ventana de conversación del chat: qué ConversationManager usa,
 * cuántos mensajes hay, el resumen activo (si lo hay) y el historial legible.
 */
export const GET: APIRoute = async ({ url }) => {
  if (!workshop.chat && url.searchParams.get('kind') !== 'onboarding') {
    return Response.json({ error: 'El chat se activa en el paso 1' }, { status: 501 })
  }
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const target = targetOf(url.searchParams.get('runId'), url.searchParams.get('kind'))
  if (target instanceof Response) return target

  try {
    return Response.json(await getContext(target))
  } catch (err) {
    return apiError(err)
  }
}

/**
 * POST /api/context
 * Body: { runId?, kind? }
 *
 * Fuerza la reducción del historial: lo que el ConversationManager haría solo al llenarse el contexto.
 * Sirve para verlo en el taller sin esperar a que la ventana se llene.
 */
export const POST: APIRoute = async ({ request }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const body = (await request.json().catch(() => ({}))) as ContextBody
  if (!workshop.chat && body.kind !== 'onboarding') {
    return Response.json({ error: 'El chat se activa en el paso 1' }, { status: 501 })
  }
  if (!workshop.session && body.kind !== 'onboarding') {
    return Response.json({ error: 'La gestión del contexto se activa en el paso 8' }, { status: 501 })
  }
  const target = targetOf(body.runId, body.kind)
  if (target instanceof Response) return target

  try {
    return Response.json(await compressContext(target))
  } catch (err) {
    return apiError(err)
  }
}
