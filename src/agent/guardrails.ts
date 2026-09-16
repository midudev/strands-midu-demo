// Hooks: se cuelgan del loop del agente. Aquí corrigen inputs, vetan tools y registran qué se usa.
// Las reglas de negocio viven en lib/running.ts; el hook solo decide cuándo aplicarlas.
import {
  AfterToolCallEvent,
  BeforeInvocationEvent,
  BeforeToolCallEvent,
  type Agent,
  type InvocationState,
} from '@strands-agents/sdk'

import { motivoRechazo } from '../lib/running'
import { isInternalTool } from '../lib/stream'
import { trace } from '../lib/trace'

import { mcpText } from './coros/client'
import { parseFitness, RUNNING_CODES, type Fitness } from './coros/data'
import type { RacePrediction } from './schema'

/** Máximo de entrenamientos que dejamos pedir de una vez a COROS. */
const MAX_SPORT_RECORDS = 30

/**
 * Lo que viaja en invocationState durante una invocación.
 * Se comparte entre hooks y tools, con los especialistas (agent as tool) y entre los nodos del swarm.
 */
export interface CoachState extends InvocationState {
  /** Tools que se han usado en esta invocación (la web lo enseña) */
  toolsUsadas?: string[]
  /** El fitness real de COROS, si ya se consultó: el guardrail de la predicción lo compara */
  fitness?: Fitness
}

export function addGuardrails(agent: Agent) {
  agent.addHook(BeforeInvocationEvent, (event) => {
    const state = event.invocationState as CoachState

    // Solo si nadie lo inicializó antes: así la lista acumula todo el recorrido (swarm, especialistas)
    state.toolsUsadas ??= []
  })

  agent.addHook(BeforeToolCallEvent, (event) => {
    const state = event.invocationState as CoachState
    const { name, input } = event.toolUse

    // 1. Corregir inputs: al pedir entrenamientos, solo running y con un límite razonable
    if (name === 'querySportRecords') {
      const args = input as Record<string, unknown>

      if (!Array.isArray(args.sportTypeCodes) || args.sportTypeCodes.length === 0) {
        args.sportTypeCodes = RUNNING_CODES
      }

      if (typeof args.limit !== 'number' || args.limit > MAX_SPORT_RECORDS) {
        args.limit = MAX_SPORT_RECORDS
      }
    }

    // 2. Vetar una predicción que no cumple las reglas. event.cancel = motivo: la tool no se ejecuta
    //    y el modelo recibe el motivo como resultado, así que puede corregir y volver a intentarlo.
    if (name === 'save_race_prediction') {
      const motivo = motivoRechazo(input as RacePrediction, state.fitness)

      if (motivo) {
        event.cancel = motivo
        trace('guardrail', 'bloqueo save_race_prediction', { motivo }, 'warn')
      }
    }
  })

  agent.addHook(AfterToolCallEvent, (event) => {
    const state = event.invocationState as CoachState
    const { name } = event.toolUse

    if (isInternalTool(name)) return

    const ok = event.result.status === 'success'

    // 3. Observabilidad: qué tools usa el agente y con qué input
    trace('tool', `${name} ${event.result.status}`, { input: event.toolUse.input, ok }, ok ? 'info' : 'warn')
    state.toolsUsadas = [...(state.toolsUsadas ?? []), name]

    // 4. Guardamos el fitness real para que el guardrail de la predicción pueda compararlo
    if (name === 'queryFitnessAssessmentOverview' && ok) {
      state.fitness = parseFitness(mcpText(event.result))
    }
  })
}
