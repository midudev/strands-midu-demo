import type { APIRoute } from 'astro'

import { restartOnboarding } from '../../agent/chat'
import { requireCoros } from '../../lib/api'
import { deleteRunner, readRunner } from '../../lib/runner'

export const prerender = false

/**
 * GET /api/runner
 * El perfil del corredor (data/runner.json), o 404 si aún no ha pasado por la bienvenida.
 */
export const GET: APIRoute = () => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const runner = readRunner()
  if (!runner) return Response.json({ error: 'Sin perfil' }, { status: 404 })

  return Response.json(runner)
}

/**
 * DELETE /api/runner
 * Borra el perfil y la conversación de bienvenida: la portada vuelve a empezar por la entrevista.
 * (El botón "Cambiar perfil" de la cabecera lo manda como POST desde un <form>.)
 */
export const DELETE: APIRoute = () => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const wiped = deleteRunner()
  restartOnboarding()

  return Response.json({ ok: true, wiped })
}

export const POST: APIRoute = ({ redirect }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  deleteRunner()
  restartOnboarding()

  return redirect('/', 303)
}
