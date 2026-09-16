// Agent State: datos estructurados que viven en agent.appState.
// El modelo NO los ve en el contexto; solo los tocan las tools y la app. Se persisten con el snapshot de la sesión.
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'

import { trace } from '../../lib/trace'

export interface CoachAppState {
  preferencias: Record<string, string>
  turnos: number
  ultimaConsulta: string | null
}

type AppStateReader = { get(key: string): unknown }

/** Lectura tipada del appState (que por dentro es un mapa clave → unknown). */
export function readCoachState(appState: AppStateReader): CoachAppState {
  return {
    preferencias: (appState.get('preferencias') as Record<string, string> | undefined) ?? {},
    turnos: (appState.get('turnos') as number | undefined) ?? 0,
    ultimaConsulta: (appState.get('ultimaConsulta') as string | undefined) ?? null,
  }
}

export const guardarPreferencia = tool({
  name: 'guardar_preferencia',
  description:
    'Guarda una preferencia estable de midu en el estado del agente (no en la conversación): ' +
    'día del rodaje largo, zapatillas, horario habitual, terreno favorito, etc. Clave corta en snake_case.',
  inputSchema: z.object({
    clave: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,30}$/)
      .describe('p. ej. "dia_tirada_larga", "zapatillas_competicion"'),
    valor: z.string().min(1).max(120),
  }),
  callback: ({ clave, valor }, context) => {
    // context.agent es el agente que está ejecutando la tool: de ahí sale su appState
    const appState = context!.agent.appState
    const preferencias = (appState.get('preferencias') as Record<string, string> | undefined) ?? {}

    preferencias[clave] = valor
    appState.set('preferencias', preferencias)

    trace('state', `preferencia ${clave}`, { valor, total: Object.keys(preferencias).length })

    return `Guardado en el estado: ${clave} = ${valor}`
  },
})

export const verPreferencias = tool({
  name: 'ver_preferencias',
  description: 'Lee las preferencias de midu guardadas en el estado del agente. Úsala antes de planificar sesiones.',
  inputSchema: z.object({}),
  callback: (_input, context) => {
    const { preferencias, turnos } = readCoachState(context!.agent.appState)
    const total = Object.keys(preferencias).length

    trace('state', 'leer preferencias', { n: total, turnos })

    if (total === 0) {
      return { preferencias: {}, turnos, nota: 'Sin preferencias guardadas todavía' }
    }

    return { preferencias, turnos }
  },
})
