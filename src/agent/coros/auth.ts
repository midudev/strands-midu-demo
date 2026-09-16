// OAuth (authorization code + PKCE) contra el MCP oficial de COROS.
// El SDK de MCP hace el flujo completo (registro dinámico del cliente, PKCE, intercambio y refresco de tokens).
// Aquí solo implementamos OAuthClientProvider persistiendo su estado en disco (.coros/auth.json).
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'

import { env } from '../../lib/env'
import { trace } from '../../lib/trace'

export const COROS_MCP_URL = env('COROS_MCP_URL', 'https://mcp.coros.com/mcp')!

export const COROS_AUTH_FILE = '.coros/auth.json'

const DEFAULT_REDIRECT_URL = 'http://localhost:4321/api/auth/coros/callback'

/** Lo que guardamos en disco. Todo opcional: el fichero empieza vacío. */
interface StoredAuth {
  redirectUrl?: string
  clientInformation?: OAuthClientInformationMixed
  tokens?: OAuthTokens
  codeVerifier?: string
  /** Anti-CSRF: lo generamos al empezar el login y lo comprobamos en el callback */
  state?: string
}

function loadStoredAuth(): StoredAuth {
  if (!existsSync(COROS_AUTH_FILE)) return {}

  return JSON.parse(readFileSync(COROS_AUTH_FILE, 'utf8'))
}

/** Conectado = hay tokens guardados. El SDK los refresca solo si caducan. */
export const isCorosConnected = () => Boolean(loadStoredAuth().tokens)

export function disconnectCoros() {
  rmSync(COROS_AUTH_FILE, { force: true })

  trace('auth', 'COROS desconectado')
}

export class FileOAuthProvider implements OAuthClientProvider {
  private data: StoredAuth

  /**
   * El SDK llama a redirectToAuthorization(url) cuando hace falta que el usuario autorice.
   * Como esto corre en el servidor, quien inicia el login se suscribe aquí y devuelve la URL como redirect HTTP.
   */
  onRedirect?: (url: URL) => void

  /** @param redirectUrl La ruta de la web que recibe el `code`. Solo la pasa el endpoint de login. */
  constructor(redirectUrl?: string) {
    this.data = loadStoredAuth()

    const redirectChanged = redirectUrl && redirectUrl !== this.data.redirectUrl

    if (redirectChanged) {
      // El cliente OAuth se registró con otra redirect_uri: hay que registrarlo de nuevo
      delete this.data.clientInformation
      this.data.redirectUrl = redirectUrl
      this.persist()
    }
  }

  private persist() {
    mkdirSync('.coros', { recursive: true })
    writeFileSync(COROS_AUTH_FILE, JSON.stringify(this.data, null, 2))
  }

  // --- Lo que el SDK de MCP nos pide ----------------------------------------------------

  get redirectUrl() {
    return this.data.redirectUrl ?? DEFAULT_REDIRECT_URL
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'midu.run coach',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid mcp.tools offline_access',
    }
  }

  state() {
    this.data.state = randomBytes(16).toString('hex')
    this.persist()

    return this.data.state
  }

  expectedState() {
    return this.data.state
  }

  clientInformation() {
    return this.data.clientInformation
  }

  saveClientInformation(info: OAuthClientInformationMixed) {
    this.data.clientInformation = info
    this.persist()
  }

  tokens() {
    return this.data.tokens
  }

  saveTokens(tokens: OAuthTokens) {
    this.data.tokens = tokens
    this.persist()

    trace('auth', 'tokens COROS guardados', { tokenType: tokens.token_type, expiresIn: tokens.expires_in })
  }

  redirectToAuthorization(url: URL) {
    if (!this.onRedirect) {
      throw new Error('Sesión de COROS caducada. Vuelve a conectar desde la web.')
    }

    this.onRedirect(url)
  }

  saveCodeVerifier(verifier: string) {
    this.data.codeVerifier = verifier
    this.persist()
  }

  codeVerifier() {
    if (!this.data.codeVerifier) throw new Error('No hay code_verifier guardado')

    return this.data.codeVerifier
  }

  /**
   * mcp.coros.com enruta a un servidor regional (p. ej. mcpeu.coros.com) y anuncia ese host como "resource".
   * El SDK lo rechazaría por no coincidir con la URL del servidor; aceptamos cualquier *.coros.com.
   */
  async validateResourceURL(serverUrl: string | URL, resource?: string) {
    const server = new URL(serverUrl)
    const target = resource ? new URL(resource) : server

    const sameHost = target.hostname === server.hostname
    const corosHost = target.hostname.endsWith('.coros.com')

    if (sameHost || corosHost) return target

    throw new Error(`Recurso inesperado: ${resource} (esperaba ${server.origin})`)
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all' || scope === 'tokens') delete this.data.tokens
    if (scope === 'all' || scope === 'client') delete this.data.clientInformation
    if (scope === 'all' || scope === 'verifier') delete this.data.codeVerifier

    this.persist()
  }
}
