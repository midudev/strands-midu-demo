import type { APIRoute } from 'astro'

import { getCoachState } from '../../agent/chat'
import { apiError, requireCoros } from '../../lib/api'
import { listMemory, MEMORY_DIR, STRANDS_DIR } from '../../lib/memory-files'

export const prerender = false

/**
 * GET /api/brain
 *
 * El "cerebro" del coach, en tres capas:
 * - estado: agent.appState (preferencias, turnos, última consulta). El modelo no lo ve.
 * - sesion: dónde está el snapshot en disco y cuántos mensajes contiene.
 * - memoria: los hechos a largo plazo que ha extraído el MemoryManager (ficheros markdown).
 */
export const GET: APIRoute = async () => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  try {
    const estado = await getCoachState()

    return Response.json({
      estado,
      sesion: {
        id: estado.sessionId,
        ruta: `${STRANDS_DIR}/sessions/${estado.sessionId}`,
        mensajes: estado.mensajes,
      },
      memoria: {
        ruta: MEMORY_DIR,
        entradas: listMemory(),
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
