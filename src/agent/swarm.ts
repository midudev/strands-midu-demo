// Swarm: varios agentes se pasan el testigo (handoff) hasta llegar a una predicción de carrera.
// Cada agente decide a quién pasa y con qué mensaje/contexto; el SDK usa structured output para el handoff:
// { agentId?, message, context? }. El invocationState se comparte entre nodos: el fitness que consulta
// el analista es el que usa el guardrail cuando el árbitro guarda.
import { Agent } from '@strands-agents/sdk'
import { Swarm } from '@strands-agents/sdk/multiagent'

import { attachSwarmTrace, predictionSince, type SwarmStep } from '../lib/predictions'
import type { Race } from '../lib/races'
import { SwarmEventTranslator, type SwarmChunk } from '../lib/swarm-events'
import { trace } from '../lib/trace'

import { corosTools } from './coach'
import { isCorosConnected } from './coros/auth'
import { addGuardrails } from './guardrails'
import { model } from './model'
import { SWARM_AGENTS, swarmAsk, type SwarmAgentDef } from './prompts/swarm'
import { saveRacePrediction } from './tools/predictions'
import { getUpcomingRaces } from './tools/races'

/** Pasos máximos antes de que el swarm corte: 4 agentes + margen para que el árbitro devuelva el testigo. */
const MAX_STEPS = 8

const SWARM_TIMEOUT_MS = 240_000

function createSwarmAgent(def: SwarmAgentDef): Agent {
  const tools = [...corosTools(), getUpcomingRaces]

  // Solo el árbitro puede guardar: así nadie "cierra" la predicción antes de tiempo
  if (def.withSave) tools.push(saveRacePrediction)

  const agent = new Agent({
    id: def.id,
    name: def.id,
    description: def.descripcion, // los demás nodos ven esta descripción para decidir a quién pasar
    systemPrompt: def.prompt,
    model,
    tools,
    printer: false,
  })

  addGuardrails(agent)

  return agent
}

export function buildSwarm(): Swarm {
  return new Swarm({
    id: 'prediccion',
    nodes: SWARM_AGENTS.map(createSwarmAgent),
    start: 'analista',
    maxSteps: MAX_STEPS,
    // Si dos agentes se pasan el testigo entre ellos sin avanzar, el SDK corta
    repetitiveHandoffDetectionWindow: 4,
    repetitiveHandoffMinUniqueAgents: 2,
    timeout: SWARM_TIMEOUT_MS,
  })
}

/** Predicción de una carrera con el enjambre, en streaming. Termina con { type: 'result' } si se guardó. */
export async function* streamPrediction(race: Race): AsyncGenerator<SwarmChunk> {
  if (!isCorosConnected()) throw new Error('Conecta COROS para poder predecir carreras')

  const startedAt = Date.now()
  trace('swarm', `prediccion ${race.nombre}`, { raceId: race.id, fecha: race.fecha })

  const swarm = buildSwarm()
  const translator = new SwarmEventTranslator()

  // El recorrido se acumula en invocationState para que las tools también puedan verlo
  const invocationState: Record<string, unknown> = { swarmSteps: translator.steps as SwarmStep[] }

  try {
    for await (const event of swarm.stream(swarmAsk(race), { invocationState })) {
      yield* translator.translate(event)
    }
  } catch (err) {
    trace('swarm', `prediccion error ${race.id}`, { error: String((err as Error).message), ms: Date.now() - startedAt }, 'error')
    throw err
  }

  // El árbitro guarda con save_race_prediction; comprobamos que lo hizo en esta ejecución
  const fresh = predictionSince(race.id, startedAt)

  if (!fresh) {
    trace('swarm', `prediccion incompleta ${race.id}`, { ms: Date.now() - startedAt }, 'error')
    throw new Error('El enjambre terminó sin guardar la predicción')
  }

  const saved = attachSwarmTrace(race.id, translator.steps) ?? fresh

  trace('swarm', `prediccion ok ${race.nombre}`, {
    raceId: race.id,
    tiempo: saved.tiempoEstimado,
    pasos: translator.pasos,
    ms: Date.now() - startedAt,
  })

  yield { type: 'result', prediction: saved }
}
