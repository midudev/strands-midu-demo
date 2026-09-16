// Un único McpClient hacia COROS, compartido por los agentes (como tool) y por el dashboard (llamadas directas).
import { McpClient, type JSONValue } from '@strands-agents/sdk'

import { trace } from '../../lib/trace'

import { COROS_MCP_URL, FileOAuthProvider } from './auth'

/** Solo exponemos a los agentes las tools de COROS que necesitan como coach. */
export const COROS_TOOLS = [
  'querySportRecords',
  'getActivityDetail',
  'queryActivityLapData',
  'queryFitnessAssessmentOverview',
  'queryTrainingLoadAssessment',
  'queryRecoveryStatus',
  'querySleepData',
]

/** El dashboard además descarga ficheros FIT, que el agente no necesita. */
const COROS_DATA_TOOLS = [...COROS_TOOLS, 'queryActivityFitFileDownloadUrls']

type CorosTool = Awaited<ReturnType<McpClient['listTools']>>[number]

let client: McpClient | undefined
let toolsByName: Promise<Map<string, CorosTool>> | undefined

/**
 * El McpClient de COROS. Se pasa tal cual en `tools` de un Agent: el SDK lo conecta y expone sus tools.
 * `toolFilters` limita cuáles ve el agente.
 */
export function corosClient(): McpClient {
  client ??= new McpClient({
    url: COROS_MCP_URL,
    authProvider: new FileOAuthProvider(),
    toolFilters: { allowed: COROS_TOOLS },
  })

  return client
}

/**
 * Tools disponibles, indexadas por nombre. Se memoiza la promesa: listTools() llama a connect(),
 * y si varias llamadas van en paralelo el SDK falla con "Already connected to a transport".
 */
function getTools(): Promise<Map<string, CorosTool>> {
  toolsByName ??= corosClient()
    .listTools({ toolFilters: { allowed: COROS_DATA_TOOLS } })
    .then((tools) => new Map(tools.map((tool) => [tool.name, tool])))
    .catch((err) => {
      toolsByName = undefined // que la siguiente llamada vuelva a intentarlo
      throw err
    })

  return toolsByName
}

/** Tras cerrar sesión o si el token muere: descarta la conexión para que la siguiente reconecte. */
export async function resetCorosClient() {
  toolsByName = undefined

  const previous = client
  client = undefined

  if (previous) trace('coros', 'cliente MCP cerrado')

  await previous?.disconnect().catch(() => {})
}

/**
 * Texto plano de un resultado MCP.
 * COROS a veces envuelve el texto en un string JSON ("...\n..."); lo desenvolvemos.
 */
export function mcpText(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> })?.content ?? []
  const raw = content.map((block) => block.text ?? '').join('\n')
  const trimmed = raw.trim()

  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed) as string
    } catch {
      // No era un string JSON: devolvemos el texto tal cual
    }
  }

  return raw
}

/** Llamada directa a una tool de COROS (sin LLM), para pintar el dashboard. */
export async function callCoros(name: string, args: JSONValue = {}): Promise<string> {
  const startedAt = Date.now()

  try {
    const tool = (await getTools()).get(name)
    if (!tool) throw new Error(`COROS no expone la tool ${name}`)

    const text = mcpText(await corosClient().callTool(tool, args))

    trace('coros', `${name} ok`, { args, ms: Date.now() - startedAt, chars: text.length, preview: text.slice(0, 280) })

    return text
  } catch (err) {
    trace('coros', `${name} error`, { args, ms: Date.now() - startedAt, error: String((err as Error).message) }, 'error')
    throw err
  }
}
