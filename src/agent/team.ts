// Multi-agente "agent as tool": el entrenador del chat tiene un equipo de especialistas.
// Cada especialista es un Agent completo (su prompt, sus tools). agent.asTool() lo convierte en una tool:
// el input es un string y la respuesta vuelve como resultado de tool. Sus eventos llegan envueltos en toolStreamUpdateEvent.
import { Agent, AfterToolCallEvent, TextBlock, ToolResultBlock, type ToolList } from '@strands-agents/sdk'

import { isInternalTool, textDelta } from '../lib/stream'
import { readTake, saveTake, type TeamTake } from '../lib/team-store'
import { hoy } from '../lib/running'
import { trace } from '../lib/trace'

import { corosTools } from './coach'
import { getRunDetail } from './coros/data'
import { addGuardrails } from './guardrails'
import { model } from './model'
import { runFacts } from './prompts/coach'
import {
  CHAT_SPECIALISTS,
  dailyAsk,
  findSpecialist,
  isChatSpecialist,
  runAsk,
  specialistResultForCoach,
  type Specialist,
} from './prompts/team'

// --- Especialistas como agentes y como tools -----------------------------------------------

export function createSpecialist(specialist: Specialist): Agent {
  const agent = new Agent({
    id: specialist.id,
    name: specialist.id,
    description: specialist.descripcion,
    systemPrompt: specialist.prompt,
    model,
    tools: corosTools(), // todos comparten el mismo McpClient: una sola conexión OAuth
    printer: false,
  })

  addGuardrails(agent)

  return agent
}

/** Fisio y nutricionista como tools del coach del chat. El nombre de la tool es el id del especialista. */
export function teamTools(): ToolList {
  return CHAT_SPECIALISTS.map((specialist) =>
    createSpecialist(specialist).asTool({ name: specialist.id, description: specialist.descripcion }),
  )
}

/**
 * La respuesta del especialista ya se ha pintado en el chat, con su cara, mientras la escribía.
 * Reescribimos el tool result (event.result es sustituible) para que el coach no la repita.
 */
export function addTeamHook(agent: Agent) {
  agent.addHook(AfterToolCallEvent, (event) => {
    const { name, toolUseId } = event.toolUse

    if (!isChatSpecialist(name) || event.result.status !== 'success') return

    const text = event.result.content.map((block) => (block.type === 'textBlock' ? block.text : '')).join('')

    trace('team', `${name} resultado reescrito para el coach`, { chars: text.length })

    event.result = new ToolResultBlock({
      toolUseId,
      status: 'success',
      content: [new TextBlock(specialistResultForCoach(name, text))],
    })
  })
}

// --- Opinión de un especialista por su cuenta (portada y /runs/:id) ----------------------

export type TeamChunk =
  | { type: 'tool'; name: string }
  | { type: 'text'; text: string }
  | { type: 'done'; take: TeamTake; cache: boolean }
  /** Solo se pidió la caché y no había nada: la web enseña el botón de pedir opinión */
  | { type: 'idle' }

interface TakeOptions {
  /** Ignora la caché y vuelve a generar */
  refresh?: boolean
  /** Opinar sobre esta sesión en vez de sobre el día */
  runId?: string
  /** Solo devolver lo cacheado; si no hay, "idle" */
  cachedOnly?: boolean
}

/** Qué le pedimos al especialista: su lectura del día, o de una sesión concreta. */
async function buildAsk(specialist: Specialist, runId?: string): Promise<string> {
  if (!runId) return dailyAsk(specialist)

  const run = await getRunDetail(runId)
  if (!run) throw new Error('Sesión no encontrada')

  return runAsk(specialist, runFacts(run))
}

/** Opinión de un especialista en streaming. */
export async function* streamSpecialistTake(id: string, options: TakeOptions = {}): AsyncGenerator<TeamChunk> {
  const { refresh = false, runId, cachedOnly = false } = options

  const specialist = findSpecialist(id)
  if (!specialist) throw new Error(`Especialista ${id} no existe`)

  const cached = refresh ? undefined : readTake(id, runId)

  if (cached) {
    trace('team', `${id} opinión cache`, { runId })
    yield { type: 'done', take: cached, cache: true }
    return
  }

  if (cachedOnly) {
    yield { type: 'idle' }
    return
  }

  const startedAt = Date.now()
  trace('team', refresh ? `${id} opinión regenerar` : `${id} opinión generar`, { runId })

  const ask = await buildAsk(specialist, runId)
  const agent = createSpecialist(specialist)

  const toolsUsadas: string[] = []
  let opinion = ''

  try {
    for await (const event of agent.stream(ask)) {
      const text = textDelta(event)

      if (text !== null) {
        opinion += text
        yield { type: 'text', text }
        continue
      }

      if (event.type === 'beforeToolCallEvent' && !isInternalTool(event.toolUse.name)) {
        yield { type: 'tool', name: event.toolUse.name }
      }

      if (event.type === 'afterToolCallEvent' && !isInternalTool(event.toolUse.name)) {
        toolsUsadas.push(event.toolUse.name)
      }
    }

    const take = saveTake({
      id,
      nombre: specialist.nombre,
      fecha: hoy(),
      opinion: opinion.trim(),
      toolsUsadas,
      ms: Date.now() - startedAt,
      ...(runId && { runId }),
    })

    trace('team', `${id} opinión ok`, { toolsUsadas, ms: take.ms, runId })

    yield { type: 'done', take, cache: false }
  } catch (err) {
    trace('team', `${id} opinión error`, { error: String((err as Error).message), ms: Date.now() - startedAt, runId }, 'error')
    throw err
  }
}
