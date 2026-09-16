import type { APIRoute } from 'astro'

import { requireCoros } from '../../lib/api'
import { loadPredictions } from '../../lib/predictions'
import { getRaces } from '../../lib/races'

export const prerender = false

/**
 * GET /api/races[?refresh]
 *
 * Próximas carreras (scraping de xipgroc.cat, caché de 6 h) más las predicciones ya guardadas,
 * indexadas por raceId. Con ?refresh se vuelve a scrapear.
 */
export const GET: APIRoute = async ({ url }) => {
  const notConnected = requireCoros()
  if (notConnected) return notConnected

  const refresh = url.searchParams.has('refresh')
  const races = await getRaces({ refresh })

  return Response.json({
    ...races,
    predicciones: loadPredictions(),
  })
}
