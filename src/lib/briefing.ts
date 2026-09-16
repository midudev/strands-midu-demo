// Caché del briefing diario en data/briefing.json. Sin Strands.
import type { Briefing } from '../agent/schema'

import { hoy } from './running'
import { readJson, writeJson } from './store'

export const BRIEFING_FILE = 'data/briefing.json'

export type StoredBriefing = Briefing & {
  /** YYYY-MM-DD del día para el que se generó */
  fecha: string
  toolsUsadas: string[]
}

/** El briefing de hoy, si ya está generado y completo. Si es de otro día, null. */
export function readTodayBriefing(): StoredBriefing | null {
  const cached = readJson<StoredBriefing | null>(BRIEFING_FILE, null)

  if (!cached) return null

  const isToday = cached.fecha === hoy()
  const isComplete = Boolean(cached.sesion && cached.semana)

  return isToday && isComplete ? cached : null
}

export function saveBriefing(briefing: StoredBriefing): StoredBriefing {
  writeJson(BRIEFING_FILE, briefing)

  return briefing
}
