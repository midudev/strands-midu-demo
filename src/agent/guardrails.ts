// Hooks del Agent: el SDK llama a estas funciones en momentos concretos de su ejecución.
// Aquí preparamos datos compartidos, corregimos o vetamos llamadas a tools y observamos su resultado.
// Las reglas de running viven en lib/running.ts; aquí decidimos cuándo aplicarlas.
import {
  AfterToolCallEvent,
  BeforeInvocationEvent,
  BeforeToolCallEvent,
  type Agent,
  type InvocationState,
} from '@strands-agents/sdk'

import { requireRunnerProfile } from '../lib/runner'
import { motivoRechazo } from '../lib/running'
import { isInternalTool } from '../lib/stream'
import { trace } from '../lib/trace'

import { mcpText } from './coros/client'
import { parseFitness, RUNNING_CODES, type Fitness } from './coros/data'
import type { RacePrediction } from './schema'

/** Máximo de entrenamientos que dejamos pedir en una sola llamada a COROS. */
const MAX_SPORT_RECORDS = 30

/**
 * Datos temporales de una invocación: no son la memoria ni la sesión del Agent.
 * El mismo objeto pasa por los hooks y las tools. En el swarm también pasa de un nodo a otro.
 */
export interface CoachState extends InvocationState {
  /** Tools intentadas en esta invocación, incluidas las canceladas (la web las enseña). */
  toolsUsadas?: string[]
  /** Fitness devuelto por COROS en esta invocación; se consulta antes de validar una predicción. */
  fitness?: Fitness
}

/**
 * PASO 5: registra tres hooks en cada Agent al crearlo.
 * La línea installGuardrails = addGuardrails de coach.ts activa este registro.
 * Secuencia: empieza la invocación → antes de cada tool → después de cada tool.
 */
export function addGuardrails(agent: Agent) {
  // A. Una vez por pregunta: prepara el estado que compartirán las llamadas a tools.
  agent.addHook(BeforeInvocationEvent, (event) => {
    const state = event.invocationState as CoachState
    // Si otro Agent del swarm ya lo creó, conservamos lo acumulado.
    state.toolsUsadas ??= []
  })

  // B. Antes de CADA llamada: todavía podemos cambiar los argumentos o impedir la ejecución.
  agent.addHook(BeforeToolCallEvent, (event) => {
    const state = event.invocationState as CoachState
    const { name, input } = event.toolUse

    if (name === 'querySportRecords') {
      const args = input as Record<string, unknown>
      const antes = { sportTypeCodes: args.sportTypeCodes, limit: args.limit }
      let corregido = false

      // Si el modelo omite el deporte, consultamos los cuatro tipos de running.
      if (!Array.isArray(args.sportTypeCodes) || args.sportTypeCodes.length === 0) {
        args.sportTypeCodes = RUNNING_CODES
        corregido = true
      }

      // COROS recibe entre 1 y 30 registros por llamada, aunque el modelo pida más.
      const limit = args.limit
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_SPORT_RECORDS) {
        args.limit = MAX_SPORT_RECORDS
        corregido = true
      }

      if (corregido) {
        trace('guardrail', 'querySportRecords: argumentos corregidos', {
          antes,
          despues: { sportTypeCodes: args.sportTypeCodes, limit: args.limit },
        })
      }
    } else if (name === 'save_race_prediction') {
      // La regla exige fitness real y compara el tiempo y la fecha con el objetivo del corredor.
      const motivo = motivoRechazo(input as RacePrediction, state.fitness, requireRunnerProfile().objetivo)

      if (motivo) {
        // El SDK no ejecuta la tool: devuelve este motivo al modelo como resultado de error.
        // El modelo puede consultar COROS o corregir la predicción y volver a intentarlo.
        event.cancel = motivo
        trace('guardrail', 'bloqueo save_race_prediction', { motivo }, 'warn')
      }
    }
  })

  // C. Después de CADA intento, incluso si el hook anterior canceló la tool.
  agent.addHook(AfterToolCallEvent, (event) => {
    const state = event.invocationState as CoachState
    const { name } = event.toolUse

    // El SDK usa algunas tools internas; aquí solo nos interesan las visibles en el taller.
    if (isInternalTool(name)) return

    const ok = event.result.status === 'success'

    // /debug enseña el input final y si la llamada terminó bien o fue rechazada.
    trace('tool', `${name} ${event.result.status}`, { input: event.toolUse.input, ok }, ok ? 'info' : 'warn')
    state.toolsUsadas = [...(state.toolsUsadas ?? []), name]

    // El siguiente BeforeToolCallEvent podrá comparar una predicción con este fitness.
    if (name === 'queryFitnessAssessmentOverview' && ok) {
      state.fitness = parseFitness(mcpText(event.result))
      trace('guardrail', 'fitness de COROS guardado en invocationState')
    }
  })
}
