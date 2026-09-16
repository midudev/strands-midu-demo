// Lo que enseña la página /debug: estado del servidor, ficheros de datos, trazas y botón de reset. Sin Strands.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

import { isChatActive, resetChat } from '../agent/chat'
import { COROS_AUTH_FILE, isCorosConnected } from '../agent/coros/auth'
import { resetCorosClient } from '../agent/coros/client'
import { MODEL_ID } from '../agent/model'

import { BRIEFING_FILE } from './briefing'
import { env } from './env'
import { PREDICTIONS_FILE } from './predictions'
import { RACES_FILE } from './races'
import { clearTraces, getTraces, trace, tracesMeta } from './trace'

/** Ficheros de datos "principales", que /debug muestra siempre aunque no existan. */
export const DATA_FILES = [BRIEFING_FILE, PREDICTIONS_FILE, RACES_FILE] as const

// --- Ficheros ----------------------------------------------------------------------------

/** Todos los .json y .md bajo `dir`, recursivo. */
function walkDataFiles(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found

  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`

    if (statSync(path).isDirectory()) {
      walkDataFiles(path, found)
    } else if (name.endsWith('.json') || name.endsWith('.md')) {
      found.push(path)
    }
  }

  return found
}

function fileStat(path: string) {
  if (!existsSync(path)) {
    return { path, exists: false as const, bytes: 0, mtime: null }
  }

  const stat = statSync(path)

  return { path, exists: true as const, bytes: stat.size, mtime: stat.mtime.toISOString() }
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null

  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    return { error: String((err as Error).message) }
  }
}

/** El fichero de auth de COROS sin secretos: solo qué hay guardado, no los valores. */
function corosAuthMeta() {
  const raw = readJsonFile(COROS_AUTH_FILE) as Record<string, unknown> | null

  if (!raw || typeof raw !== 'object' || 'error' in raw) return raw

  const tokens = raw.tokens as Record<string, unknown> | undefined

  return {
    hasTokens: Boolean(tokens),
    tokenType: tokens?.token_type ?? null,
    expiresIn: tokens?.expires_in ?? null,
    hasRefresh: Boolean(tokens?.refresh_token),
    hasClient: Boolean(raw.clientInformation),
    hasVerifier: Boolean(raw.codeVerifier),
    redirectUrl: raw.redirectUrl ?? null,
  }
}

/** Solo se pueden leer por /api/debug?file= los ficheros de datos conocidos y lo que haya bajo data/. */
function allowedDebugFiles(): Set<string> {
  return new Set<string>([...DATA_FILES, COROS_AUTH_FILE, ...walkDataFiles('data')])
}

/** Normaliza una ruta pedida por la web y comprueba que está en la lista blanca (evita path traversal). */
function resolveDebugFile(input: string) {
  if (!input || input.includes('\0') || input.includes('..')) return null

  const resolved = resolve(process.cwd(), input)
  const fromRoot = relative(process.cwd(), resolved).split(sep).join('/')

  const escapesProject = !fromRoot || fromRoot.startsWith('../') || fromRoot === '..'
  if (escapesProject) return null

  if (!allowedDebugFiles().has(fromRoot)) return null
  if (!existsSync(resolved) || !statSync(resolved).isFile()) return null

  return { resolved, path: fromRoot }
}

/** Contenido de un fichero local para /debug. El de auth va sanitizado. null si no está permitido. */
export function readLocalDebugFile(input: string) {
  const file = resolveDebugFile(input)
  if (!file) return null

  const bytes = statSync(file.resolved).size

  if (file.path === COROS_AUTH_FILE) {
    return { path: file.path, sanitized: true, bytes, content: corosAuthMeta() }
  }

  const raw = readFileSync(file.resolved, 'utf8')

  if (!file.path.endsWith('.json')) {
    return { path: file.path, sanitized: false, bytes, content: raw }
  }

  try {
    return { path: file.path, sanitized: false, bytes, content: JSON.parse(raw) }
  } catch (err) {
    return { path: file.path, sanitized: false, bytes, content: { error: String((err as Error).message), raw } }
  }
}

// --- Snapshot ----------------------------------------------------------------------------

type BriefingSummary = { fecha?: string; titular?: string; toolsUsadas?: string[] }
type PredictionSummary = { nombre?: string; tiempoEstimado?: string; creadaEn?: string }
type RacesSummary = { fetchedAt?: string; races?: unknown[] }

const isReadable = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !('error' in (value as object))

/** Todo lo que pinta /debug de una vez. `after`: solo trazas con id mayor. */
export function getDebugSnapshot(after = 0) {
  const briefing = readJsonFile(BRIEFING_FILE) as BriefingSummary | null
  const predictions = (readJsonFile(PREDICTIONS_FILE) ?? {}) as Record<string, PredictionSummary>
  const races = readJsonFile(RACES_FILE) as RacesSummary | null

  const knownFiles = new Set<string>([...DATA_FILES, COROS_AUTH_FILE])
  const otherDataFiles = walkDataFiles('data').filter((path) => !knownFiles.has(path))

  const predictionsSummary = Object.fromEntries(
    Object.entries(predictions).map(([raceId, p]) => [
      raceId,
      { nombre: p.nombre, tiempoEstimado: p.tiempoEstimado, creadaEn: p.creadaEn },
    ]),
  )

  return {
    runtime: {
      now: new Date().toISOString(),
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      model: MODEL_ID,
      openaiKey: Boolean(env('OPENAI_API_KEY')),
      corosConnected: isCorosConnected(),
      chatAgent: isChatActive(),
    },
    files: [...DATA_FILES, COROS_AUTH_FILE, ...otherDataFiles].map(fileStat),
    stored: {
      briefing: isReadable(briefing)
        ? { fecha: briefing.fecha ?? null, titular: briefing.titular ?? null, toolsUsadas: briefing.toolsUsadas ?? [] }
        : briefing,
      predictions: predictionsSummary,
      races: isReadable(races)
        ? { fetchedAt: races.fetchedAt ?? null, count: Array.isArray(races.races) ? races.races.length : 0 }
        : races,
      coros: corosAuthMeta(),
    },
    traces: getTraces(after),
    tracesMeta: tracesMeta(),
  }
}

// --- Reset -------------------------------------------------------------------------------

/** Borra data/ (menos .gitkeep), .coros/ y todo el estado en memoria. Devuelve qué se ha borrado. */
export async function resetAllLocalData(): Promise<string[]> {
  const wiped: string[] = []

  if (existsSync('data')) {
    for (const name of readdirSync('data')) {
      if (name === '.gitkeep') continue

      const path = `data/${name}`
      const isDirectory = statSync(path).isDirectory()

      rmSync(path, { recursive: true, force: true })
      wiped.push(isDirectory ? `${path}/` : path)
    }
  }

  if (existsSync('.coros')) {
    rmSync('.coros', { recursive: true, force: true })
    wiped.push('.coros/')
  }

  await resetCorosClient()
  resetChat()
  clearTraces()

  trace('reset', 'Datos locales y estado en memoria borrados', { wiped })

  return wiped
}
