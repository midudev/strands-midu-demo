import type { APIRoute } from 'astro'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'

import { COROS_MCP_URL, FileOAuthProvider } from '../../../../agent/coros/auth'
import { resetCorosClient } from '../../../../agent/coros/client'

export const prerender = false

/**
 * GET /api/auth/coros/login
 *
 * Paso 1 del OAuth (authorization code + PKCE) contra el MCP de COROS.
 * El SDK de MCP registra el cliente si hace falta y nos da la URL de autorización;
 * mandamos al usuario allí. COROS volverá a /api/auth/coros/callback con el código.
 */
export const GET: APIRoute = async ({ url, redirect }) => {
  // Cerramos cualquier conexión MCP previa: los tokens van a cambiar
  await resetCorosClient()

  const callbackUrl = `${url.origin}/api/auth/coros/callback`
  const provider = new FileOAuthProvider(callbackUrl)

  // Login limpio: descartamos tokens antiguos aunque siguieran siendo válidos
  provider.invalidateCredentials('tokens')

  // El SDK no redirige por sí mismo: nos entrega la URL y la devolvemos como redirect
  let authorizationUrl: URL | undefined
  provider.onRedirect = (target) => {
    authorizationUrl = target
  }

  const result = await auth(provider, { serverUrl: COROS_MCP_URL })

  if (result === 'AUTHORIZED') return redirect('/')

  if (!authorizationUrl) {
    return new Response('COROS no devolvió URL de autorización', { status: 502 })
  }

  return redirect(authorizationUrl.toString())
}
