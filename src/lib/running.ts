// Reglas y aritmética de running. Sin Strands: puro TypeScript que usan guardrails, prompts y la UI.
import type { Fitness } from '../agent/coros/data'
import type { RacePrediction } from '../agent/schema'

import type { RunnerGoal } from './runner'

/** Hoy en YYYY-MM-DD. */
export const hoy = () => new Date().toISOString().slice(0, 10)

/** Días desde `desde` (hoy por defecto) hasta `fecha`. Negativo si ya pasó. */
export function diasHasta(fecha: string, desde = hoy()): number {
  const ms = Date.parse(fecha) - Date.parse(desde)

  return Math.round(ms / 86400_000)
}

/** "h:mm:ss" o "mm:ss" → segundos. */
export function toSeconds(time: string): number {
  return time
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0)
}

/** Segundos → "h:mm:ss" (o "mm:ss" si no llega a la hora). */
export function fmtTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.round(totalSeconds % 60)

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  return hours ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`
}

/** Exponente de la fórmula de Riegel: t2 = t1 · (d2 / d1) ^ 1.06 */
const RIEGEL_EXPONENT = 1.06

export interface CorosPrediction {
  seconds: number
  /** false si la distancia no es estándar y se ha interpolado con Riegel */
  exact: boolean
}

/**
 * Predicción de COROS para una distancia.
 * Si la distancia no es estándar, interpola con Riegel desde el punto más cercano.
 * null si COROS no tiene ninguna predicción.
 */
export function corosPrediction(fitness: Fitness, km: number): CorosPrediction | null {
  const candidates: Array<[number, string | null | undefined]> = [
    [5, fitness.prediccion['5K']],
    [10, fitness.prediccion['10K']],
    [21.1, fitness.prediccion.media],
    [42.2, fitness.prediccion.maraton],
  ]

  const points = candidates
    .filter((point): point is [number, string] => Boolean(point[1]))
    .map(([distance, time]) => [distance, toSeconds(time)] as const)

  if (points.length === 0) return null

  const exact = points.find(([distance]) => Math.abs(distance - km) < 0.3)
  if (exact) return { seconds: exact[1], exact: true }

  const [nearestKm, nearestSeconds] = points.reduce((best, point) =>
    Math.abs(best[0] - km) < Math.abs(point[0] - km) ? best : point,
  )

  return { seconds: nearestSeconds * Math.pow(km / nearestKm, RIEGEL_EXPONENT), exact: false }
}

/** Predicción de COROS en segundos para una distancia (ver corosPrediction). */
export const corosBaseline = (fitness: Fitness, km: number) => corosPrediction(fitness, km)?.seconds ?? null

/** Margen que le damos al modelo sobre la predicción de COROS antes de considerar que "vende humo" (2 %). */
const OPTIMISM_TOLERANCE = 0.98

/** Ventana de protección alrededor de la carrera objetivo: 3 semanas antes y 2 después si es un maratón; menos si es corta. */
export function ventanaProteccion(goal: RunnerGoal): { antes: number; despues: number } {
  return goal.distanciaKm >= 30 ? { antes: 21, despues: 14 } : { antes: 10, despues: 5 }
}

/** Solo protegemos carreras de esta distancia o más; un 5K no compromete el objetivo. */
const MIN_KM_TO_PROTECT = 10

/**
 * Reglas de negocio de una predicción. Devuelve el motivo del rechazo (redactado para el modelo) o null si es válida.
 * 1. Sin datos reales de COROS no hay predicción.
 * 2. No vendas humo: nunca más rápido que lo que COROS estima para esa distancia.
 * 3. La carrera objetivo manda: nada de competir ≥10 km en las semanas previas ni las posteriores.
 */
export function motivoRechazo(prediction: RacePrediction, fitness: Fitness | undefined, goal: RunnerGoal): string | null {
  if (!fitness) {
    return 'Antes de predecir consulta queryFitnessAssessmentOverview: la predicción debe partir de datos reales de COROS.'
  }

  const baseline = corosBaseline(fitness, prediction.distanciaKm)
  const tooFast = baseline !== null && toSeconds(prediction.tiempoEstimado) < baseline * OPTIMISM_TOLERANCE

  if (tooFast) {
    return (
      `COROS estima ${fmtTime(baseline)} para ${prediction.distanciaKm} km y tú propones ${prediction.tiempoEstimado}. ` +
      'Ajusta la predicción: no puede ser más optimista que el reloj.'
    )
  }

  const { antes, despues } = ventanaProteccion(goal)
  const daysFromGoal = diasHasta(prediction.fecha, goal.fecha)
  const insideProtectedWindow = daysFromGoal >= -antes && daysFromGoal <= despues
  const wantsToRace = prediction.recomendacion === 'competir' && prediction.distanciaKm >= MIN_KM_TO_PROTECT

  if (wantsToRace && insideProtectedWindow) {
    return (
      `Esa carrera cae a ${Math.abs(daysFromGoal)} días de ${goal.carrera}, el objetivo de la temporada. ` +
      'No recomiendes competir: propón "social" o "evitar" y explica por qué.'
    )
  }

  return null
}
