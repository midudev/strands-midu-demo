// Reglas y aritmética de running. Sin Strands: puro TypeScript que usan guardrails, prompts y la UI.
import type { Fitness } from '../agent/coros/data'
import type { RacePrediction } from '../agent/schema'

/** Fecha del Maratón de Valencia, el objetivo de la temporada. */
export const VALENCIA = '2026-12-06'

/** Hoy en YYYY-MM-DD. */
export const hoy = () => new Date().toISOString().slice(0, 10)

/** Días desde `desde` (hoy por defecto) hasta `fecha`. Negativo si ya pasó. */
export function diasHasta(fecha: string, desde = hoy()): number {
  const ms = Date.parse(fecha) - Date.parse(desde)

  return Math.round(ms / 86400_000)
}

export const diasParaValencia = (desde = hoy()) => diasHasta(VALENCIA, desde)

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

/**
 * Predicción de COROS (en segundos) para una distancia.
 * Si la distancia no es estándar, interpola con Riegel desde el punto más cercano.
 * null si COROS no tiene ninguna predicción.
 */
export function corosBaseline(fitness: Fitness, km: number): number | null {
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
  if (exact) return exact[1]

  const [nearestKm, nearestSeconds] = points.reduce((best, point) =>
    Math.abs(best[0] - km) < Math.abs(point[0] - km) ? best : point,
  )

  return nearestSeconds * Math.pow(km / nearestKm, RIEGEL_EXPONENT)
}

/** Margen que le damos al modelo sobre la predicción de COROS antes de considerar que "vende humo" (2 %). */
const OPTIMISM_TOLERANCE = 0.98

/** Ventana de protección alrededor de Valencia: 3 semanas antes, 2 después. */
const DAYS_BEFORE_VALENCIA = 21
const DAYS_AFTER_VALENCIA = 14

/** Solo protegemos carreras de esta distancia o más; un 5K no compromete el maratón. */
const MIN_KM_TO_PROTECT = 10

/**
 * Reglas de negocio de una predicción. Devuelve el motivo del rechazo (redactado para el modelo) o null si es válida.
 * 1. Sin datos reales de COROS no hay predicción.
 * 2. No vendas humo: nunca más rápido que lo que COROS estima para esa distancia.
 * 3. Valencia es el objetivo: nada de competir ≥10 km en las 3 semanas previas ni las 2 posteriores.
 */
export function motivoRechazo(prediction: RacePrediction, fitness: Fitness | undefined): string | null {
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

  const daysFromValencia = diasHasta(prediction.fecha, VALENCIA)
  const insideProtectedWindow = daysFromValencia >= -DAYS_BEFORE_VALENCIA && daysFromValencia <= DAYS_AFTER_VALENCIA
  const wantsToRace = prediction.recomendacion === 'competir' && prediction.distanciaKm >= MIN_KM_TO_PROTECT

  if (wantsToRace && insideProtectedWindow) {
    return (
      `Esa carrera cae a ${Math.abs(daysFromValencia)} días del Maratón de Valencia. ` +
      'No recomiendes competir: propón "social" o "evitar" y explica por qué.'
    )
  }

  return null
}
