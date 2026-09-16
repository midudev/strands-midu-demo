import type { APIRoute } from 'astro'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'

import { COROS_MCP_URL, FileOAuthProvider } from '../../../../agent/coros/auth'

export const prerender = false

const backToHome = (status: 'ok' | 'error', motivo?: string) =>
  status === 'ok' ? '/?coros=ok' : `/?coros=error&motivo=${encodeURIComponent(motivo ?? 'desconocido')}`

/**
 * GET /api/auth/coros/callback?code=...&state=...
 *
 * Paso 2 del OAuth: COROS vuelve con el código de autorización.
 * Comprobamos el `state` (anti-CSRF) y cambiamos el código por tokens, que el provider guarda en disco.
 */
export const GET: APIRoute = async ({ url, redirect }) => {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error || !code) {
    return redirect(backToHome('error', error ?? 'sin code'))
  }

  const provider = new FileOAuthProvider()

  if (state !== provider.expectedState()) {
    return redirect(backToHome('error', 'state'))
  }

  const result = await auth(provider, { serverUrl: COROS_MCP_URL, authorizationCode: code })

  if (result !== 'AUTHORIZED') {
    return redirect(backToHome('error', 'token'))
  }

  return redirect(backToHome('ok'))
}
