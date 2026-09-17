// El coach: un Agent de Strands = modelo + system prompt + tools.
// Las tools son el McpClient de COROS (datos reales), las carreras de xipgroc y guardar predicciones.
import { Agent, type ToolList } from '@strands-agents/sdk'

import { isCorosConnected } from './coros/auth'
import { corosClient } from './coros/client'
import { addGuardrails } from './guardrails'
import { requireRunnerProfile } from '../lib/runner'

import { model } from './model'
import { coachPrompt } from './prompts/coach'
import { saveRacePrediction } from './tools/predictions'
import { getUpcomingRaces } from './tools/races'

/** El McpClient de COROS se pasa directamente en `tools`: el SDK lo conecta y expone sus tools al agente. */
export function corosTools(): ToolList {
  return isCorosConnected() ? [corosClient()] : []
}

export function coachTools(): ToolList {
  return [...corosTools(), getUpcomingRaces, saveRacePrediction]
}

/** Un coach sin memoria de conversación: para invocaciones sueltas (briefing). El chat usa getChatAgent(). */
export function createCoach(systemPrompt = coachPrompt(requireRunnerProfile()), tools: ToolList = coachTools()): Agent {
  const coach = new Agent({
    model,
    systemPrompt,
    tools,
    printer: false, // no queremos que el SDK escriba en la consola del servidor
  })

  addGuardrails(coach)

  return coach
}
