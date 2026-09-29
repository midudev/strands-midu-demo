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
const noCorosTools = (): ToolList => []
export let corosTools = noCorosTools
// PASO 2 · Descomenta esta línea: el McpClient entra en tools del Agent.
corosTools = () => isCorosConnected() ? [corosClient()] : []
export const MCP_ENABLED = corosTools !== noCorosTools

let ownRaceTool: typeof getUpcomingRaces | null = null
// PASO 3 · Descomenta esta línea: una tool() propia con schema Zod.
ownRaceTool = getUpcomingRaces
export const OWN_TOOL_ENABLED = ownRaceTool !== null

const noGuardrails = (_agent: Agent) => {}
export let installGuardrails = noGuardrails
// PASO 5 · Descomenta esta línea: hooks del agente para validar y observar.
installGuardrails = addGuardrails
export const GUARDRAILS_ENABLED = installGuardrails !== noGuardrails

export function coachTools(): ToolList {
  const tools: ToolList = [...corosTools()]
  if (ownRaceTool) tools.push(ownRaceTool)
  // La tool de guardado se muestra cuando también funcionan sus guardrails.
  if (GUARDRAILS_ENABLED) tools.push(saveRacePrediction)
  return tools
}

/** Un coach sin memoria de conversación: para invocaciones sueltas (briefing). El chat usa getChatAgent(). */
export function createCoach(systemPrompt = coachPrompt(requireRunnerProfile()), tools: ToolList = coachTools()): Agent {
  const coach = new Agent({
    model,
    systemPrompt,
    tools,
    printer: false, // no queremos que el SDK escriba en la consola del servidor
  })

  installGuardrails(coach)

  return coach
}
