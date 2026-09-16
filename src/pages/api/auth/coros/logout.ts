import type { APIRoute } from 'astro'

import { resetChat } from '../../../../agent/chat'
import { disconnectCoros } from '../../../../agent/coros/auth'
import { resetCorosClient } from '../../../../agent/coros/client'

export const prerender = false

/**
 * POST /api/auth/coros/logout
 *
 * Cierra la conexión MCP, borra los tokens de disco y descarta los agentes del chat
 * (su sesión en disco se conserva: al volver a conectar, el chat sigue donde estaba).
 */
export const POST: APIRoute = async ({ redirect }) => {
  await resetCorosClient()
  disconnectCoros()
  resetChat()

  return redirect('/')
}
