// Caché de las opiniones del equipo. Sin Strands.
// - Diarias (portada): data/team.json, clave = especialista. Solo valen el día en que se generaron.
// - Por sesión (/runs/:id): data/team-runs.json, clave = "runId:especialista". No caducan: la sesión no cambia.
import { hoy } from './running'
import { readJson, writeJson } from './store'

export const TEAM_FILE = 'data/team.json'
export const RUN_TEAM_FILE = 'data/team-runs.json'

export interface TeamTake {
  /** id del especialista: fisio, entrenador, nutricionista */
  id: string
  nombre: string
  /** YYYY-MM-DD en que se generó */
  fecha: string
  /** Solo en opiniones sobre una sesión concreta */
  runId?: string
  opinion: string
  toolsUsadas: string[]
  ms: number
}

type TakeIndex = Record<string, TeamTake>

const fileFor = (runId?: string) => (runId ? RUN_TEAM_FILE : TEAM_FILE)

const keyFor = (specialistId: string, runId?: string) => (runId ? `${runId}:${specialistId}` : specialistId)

/** Opinión cacheada y vigente, o undefined si no hay o ha caducado. */
export function readTake(specialistId: string, runId?: string): TeamTake | undefined {
  const index = readJson<TakeIndex>(fileFor(runId), {})
  const cached = index[keyFor(specialistId, runId)]

  if (!cached) return undefined

  const stillValid = Boolean(runId) || cached.fecha === hoy()

  return stillValid ? cached : undefined
}

export function saveTake(take: TeamTake): TeamTake {
  const file = fileFor(take.runId)
  const index = readJson<TakeIndex>(file, {})

  index[keyFor(take.id, take.runId)] = take
  writeJson(file, index)

  return take
}
