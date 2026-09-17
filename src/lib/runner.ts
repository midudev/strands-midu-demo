// El perfil del corredor: quién es y qué prepara. Lo rellena la conversación de bienvenida (onboarding)
// y de él salen todos los prompts, los guardrails y la portada. Sin Strands: solo disco y texto.
import { existsSync, rmSync } from 'node:fs'

import { diasHasta, fmtTime, hoy, toSeconds } from './running'
import { readJson, writeJson } from './store'
import { trace } from './trace'

export const RUNNER_FILE = 'data/runner.json'

export interface RunnerGoal {
  /** Nombre de la carrera objetivo, p. ej. "Maratón de Valencia" */
  carrera: string
  /** YYYY-MM-DD */
  fecha: string
  distanciaKm: number
  /** Tiempo objetivo "h:mm:ss" o "mm:ss"; null si el objetivo es terminarla */
  tiempo: string | null
}

export interface RunnerProfile {
  nombre: string
  ciudad: string | null
  objetivo: RunnerGoal
  /** Días que corre a la semana (1 a 7). 7 = nunca descansa del todo. */
  diasPorSemana: number
  /** Lesiones, restricciones, gustos: lo que el coach debe tener en cuenta desde el primer día */
  notas: string[]
  /** ISO del momento en que se guardó */
  creado: string
}

// --- Persistencia --------------------------------------------------------------------------

export function readRunner(): RunnerProfile | null {
  const stored = readJson<RunnerProfile | null>(RUNNER_FILE, null)
  const isComplete = Boolean(stored?.nombre && stored?.objetivo?.fecha && stored?.objetivo?.distanciaKm)

  return isComplete ? stored : null
}

export const hasRunner = () => readRunner() !== null

/** El perfil, o un error claro si aún no existe (las rutas comprueban antes con requireRunner). */
export function requireRunnerProfile(): RunnerProfile {
  const runner = readRunner()
  if (!runner) throw new Error('Falta el perfil del corredor: completa la bienvenida')

  return runner
}

export function saveRunner(profile: Omit<RunnerProfile, 'creado'>): RunnerProfile {
  const runner: RunnerProfile = { ...profile, creado: new Date().toISOString() }

  writeJson(RUNNER_FILE, runner)
  trace('runner', `perfil guardado: ${runner.nombre}`, { objetivo: runner.objetivo, diasPorSemana: runner.diasPorSemana })

  return runner
}

export function deleteRunner(): boolean {
  if (!existsSync(RUNNER_FILE)) return false

  rmSync(RUNNER_FILE, { force: true })
  trace('runner', 'perfil borrado')

  return true
}

// --- Aritmética del objetivo ----------------------------------------------------------------

export const diasParaObjetivo = (runner: RunnerProfile, desde = hoy()) => diasHasta(runner.objetivo.fecha, desde)

/** Ritmo objetivo "m:ss" por km, o null si no hay tiempo objetivo. */
export function ritmoObjetivo(runner: RunnerProfile): string | null {
  const { tiempo, distanciaKm } = runner.objetivo
  if (!tiempo || distanciaKm <= 0) return null

  return fmtTime(toSeconds(tiempo) / distanciaKm)
}

/** Nombre corto de la distancia: "maratón", "media maratón", "10K"... */
export function nombreDistancia(km: number): string {
  if (Math.abs(km - 42.195) < 0.5) return 'maratón'
  if (Math.abs(km - 21.0975) < 0.5) return 'media maratón'
  if (Number.isInteger(km)) return `${km}K`

  return `${km} km`
}

/** Fecha en español, p. ej. "6 de diciembre de 2026". */
export function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${fecha}T12:00:00`))
}

/** Fecha corta para la UI, p. ej. "6 dic". */
export function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${fecha}T12:00:00`)).replace('.', '')
}

export const corresTodosLosDias = (runner: RunnerProfile) => runner.diasPorSemana >= 7

// --- Texto para los prompts ------------------------------------------------------------------

/** Ficha del corredor en texto: la comparten el coach, el equipo, el enjambre y la memoria. */
export function runnerFacts(runner: RunnerProfile): string {
  const { objetivo } = runner
  const ritmo = ritmoObjetivo(runner)
  const meta = objetivo.tiempo ? `bajar de ${objetivo.tiempo}${ritmo ? ` (ritmo ${ritmo}/km)` : ''}` : 'terminarla bien'

  const lines = [
    `- Se llama ${runner.nombre}${runner.ciudad ? ` y vive en ${runner.ciudad}` : ''}.`,
    `- Objetivo principal: ${objetivo.carrera} (${nombreDistancia(objetivo.distanciaKm)}, ${objetivo.distanciaKm} km), ` +
      `el ${fechaLarga(objetivo.fecha)}: ${meta}.`,
    corresTodosLosDias(runner)
      ? '- Corre TODOS los días (lleva una racha). Nunca propongas descanso total; el día suave es un trote de 3 a 6 km.'
      : `- Corre ${runner.diasPorSemana} días a la semana: los demás son de descanso (0 km) y así hay que planificarlos.`,
  ]

  if (runner.notas.length) {
    lines.push(`- A tener en cuenta: ${runner.notas.join('; ')}.`)
  }

  return lines.join('\n')
}

/** Una línea: "Maratón de Valencia · 6 dic · sub 2:55". Para la UI. */
export function resumenObjetivo(runner: RunnerProfile): string {
  const { objetivo } = runner
  const meta = objetivo.tiempo ? `sub ${objetivo.tiempo}` : 'terminar'

  return `${objetivo.carrera} · ${fechaCorta(objetivo.fecha)} · ${meta}`
}
