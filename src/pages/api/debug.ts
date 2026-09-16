import type { APIRoute } from 'astro'

import { getDebugSnapshot, readLocalDebugFile, resetAllLocalData } from '../../lib/debug'
import { clearTraces, trace } from '../../lib/trace'

export const prerender = false

interface DebugBody {
  action?: 'clear-traces' | 'reset'
}

/**
 * GET /api/debug[?after=<id>]
 *   Snapshot del servidor: runtime, ficheros de datos, trazas (solo las posteriores a `after`).
 *
 * GET /api/debug?file=<ruta>
 *   Contenido de un fichero local de datos (solo los permitidos; el de auth va sanitizado).
 */
export const GET: APIRoute = ({ url }) => {
  const file = url.searchParams.get('file')

  if (file) {
    const content = readLocalDebugFile(file)

    if (!content) {
      return Response.json({ error: 'Archivo no disponible' }, { status: 404 })
    }

    return Response.json(content)
  }

  const afterParam = Number(url.searchParams.get('after') ?? 0)
  const after = Number.isFinite(afterParam) ? afterParam : 0

  return Response.json(getDebugSnapshot(after))
}

/**
 * POST /api/debug
 * Body: { action: 'clear-traces' } para vaciar las trazas.
 * Cualquier otro body: borra TODOS los datos locales (data/, .coros/) y el estado en memoria.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as DebugBody

  if (body.action === 'clear-traces') {
    clearTraces()
    trace('reset', 'trazas borradas')

    return Response.json(getDebugSnapshot())
  }

  const wiped = await resetAllLocalData()

  return Response.json({ ok: true, wiped, ...getDebugSnapshot() })
}
