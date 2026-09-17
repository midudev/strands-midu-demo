import type { APIRoute } from 'astro'

import { dailyBriefing } from '../../agent/briefing'
import { apiError, requireReady } from '../../lib/api'

export const prerender = false

/**
 * GET /api/briefing[?refresh]
 *
 * El briefing del día (structured output del coach). Se cachea por fecha en data/briefing.json;
 * con ?refresh se vuelve a generar aunque ya exista el de hoy.
 */
export const GET: APIRoute = async ({ url }) => {
  const notReady = requireReady()
  if (notReady) return notReady

  const refresh = url.searchParams.has('refresh')

  try {
    return Response.json(await dailyBriefing({ refresh }))
  } catch (err) {
    console.error(err)
    return apiError(err)
  }
}
