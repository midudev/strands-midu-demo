// Almacén de predicciones de carrera en data/predictions.json (lo que pinta la web). Sin Strands.
import type { RacePrediction } from '../agent/schema'

import { readJson, writeJson } from './store'
import { trace } from './trace'

export const PREDICTIONS_FILE = 'data/predictions.json'

/** Un paso del enjambre: qué agente actuó, qué tools usó y a quién pasó el testigo. */
export interface SwarmStep {
  agente: string
  paso: number
  ms: number
  tools: string[]
  /** El "message" del handoff (o el texto final si no hubo handoff) */
  mensaje: string
  /** El "context" del handoff: datos compactos para el siguiente agente */
  contexto: Record<string, unknown> | null
  /** A quién pasó el testigo; null si terminó */
  siguiente: string | null
}

export interface StoredPrediction extends RacePrediction {
  /** ISO del momento en que se guardó */
  creadaEn: string
  toolsUsadas: string[]
  /** Recorrido del enjambre, si la predicción salió de él */
  swarm?: SwarmStep[]
}

type PredictionIndex = Record<string, StoredPrediction>

/** Todas las predicciones, indexadas por raceId. */
export function loadPredictions(): PredictionIndex {
  return readJson<PredictionIndex>(PREDICTIONS_FILE, {})
}

/** Guarda (o sobreescribe) la predicción de una carrera. La llama la tool save_race_prediction. */
export function savePrediction(prediction: RacePrediction, toolsUsadas: string[] = []): StoredPrediction {
  const index = loadPredictions()

  const stored: StoredPrediction = {
    ...prediction,
    creadaEn: new Date().toISOString(),
    toolsUsadas,
  }

  index[prediction.raceId] = stored
  writeJson(PREDICTIONS_FILE, index)

  trace('store', `prediccion ${prediction.nombre}`, {
    raceId: prediction.raceId,
    tiempo: prediction.tiempoEstimado,
    recomendacion: prediction.recomendacion,
  })

  return stored
}

/** Cuando el enjambre termina, adjuntamos su recorrido a la predicción para enseñarlo en la web. */
export function attachSwarmTrace(raceId: string, swarm: SwarmStep[]): StoredPrediction | undefined {
  const index = loadPredictions()
  const existing = index[raceId]

  if (!existing) return undefined

  index[raceId] = { ...existing, swarm }
  writeJson(PREDICTIONS_FILE, index)

  return index[raceId]
}

/** La predicción de una carrera si se guardó después del instante `since` (ms). Sirve para saber si el enjambre llegó a guardar. */
export function predictionSince(raceId: string, since: number): StoredPrediction | undefined {
  const prediction = loadPredictions()[raceId]

  if (!prediction) return undefined

  return Date.parse(prediction.creadaEn) >= since ? prediction : undefined
}
