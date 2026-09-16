// Traduce los eventos de agent.stream() a los chunks que pinta el chat de la web.
// Incluye los eventos anidados de los especialistas (agent as tool), que el SDK reenvía envueltos en toolStreamUpdateEvent.
import type { AgentStreamEvent } from '@strands-agents/sdk'

import { mcpText } from '../agent/coros/client'

import type { ContextInfo } from './chat-history'
import { errText, isInternalTool, textDelta } from './stream'
import { trace } from './trace'

export type ChatChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; id: string; name: string; parent?: string }
  | { type: 'tool_end'; id: string; name: string; ms: number; ok: boolean; parent?: string; input?: unknown; output?: string }
  | { type: 'agent_start'; id: string; name: string; input: string }
  | { type: 'agent_text'; id: string; text: string }
  | { type: 'agent_end'; id: string; name: string; ms: number; ok: boolean }
  | { type: 'context'; context: ContextInfo; cayeron: number }
  | { type: 'done' }

/** Más allá de esto, la salida de una tool se recorta antes de mandarla al navegador. */
const TOOL_OUTPUT_MAX_CHARS = 24_000

type ToolCallEvent = Extract<AgentStreamEvent, { type: 'beforeToolCallEvent' | 'afterToolCallEvent' }>

function prettyJson(text: string): string {
  const trimmed = text.trim()
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[')

  if (!looksLikeJson) return text

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return text
  }
}

/** Input y output de una tool ya terminada, listos para enseñarlos en el chat. */
function toolIo(event: { error?: unknown; toolUse: { input: unknown }; result: unknown }) {
  const rawInput = event.toolUse.input
  const isEmptyObject =
    rawInput != null && typeof rawInput === 'object' && !Array.isArray(rawInput) && Object.keys(rawInput).length === 0
  const input = rawInput == null || isEmptyObject ? undefined : rawInput

  let output = errText(event.error) || prettyJson(mcpText(event.result))

  if (output.length > TOOL_OUTPUT_MAX_CHARS) {
    const hidden = (output.length - TOOL_OUTPUT_MAX_CHARS).toLocaleString('es')
    output = `${output.slice(0, TOOL_OUTPUT_MAX_CHARS)}\n… (${hidden} caracteres más)`
  }

  return {
    ...(input !== undefined && { input }),
    ...(output && { output }),
  }
}

/**
 * Una instancia por turno de chat. Lleva la cuenta de las tools abiertas (para medir su duración)
 * y de qué especialista está hablando (para atribuirle sus eventos anidados).
 */
export class ChatEventTranslator {
  /** toolUseId → instante en que empezó la tool */
  private startedAt = new Map<string, number>()

  /** toolUseId → nombre del especialista, para reconocer su cierre */
  private specialistByCall = new Map<string, string>()

  /** nombre del especialista → toolUseId, para atribuir sus eventos anidados */
  private callBySpecialist = new Map<string, string>()

  constructor(private isSpecialist: (toolName: string) => boolean) {}

  *translate(event: AgentStreamEvent): Generator<ChatChunk> {
    const text = textDelta(event)

    if (text !== null) {
      yield { type: 'text', text }
      return
    }

    if (event.type === 'toolStreamUpdateEvent') {
      yield* this.nestedEvents(event.event.data)
      return
    }

    yield* this.toolEvents(event)
  }

  /** Eventos que un especialista (agent as tool) emite mientras trabaja: su texto y sus propias tools. */
  private *nestedEvents(data: unknown): Generator<ChatChunk> {
    const inner = data as AgentStreamEvent | undefined
    const comesFromAnAgent = inner && typeof inner === 'object' && 'agent' in inner

    if (!comesFromAnAgent) return

    const parentCallId = this.callBySpecialist.get(inner.agent.id)
    if (!parentCallId) return

    const text = textDelta(inner)

    if (text !== null) {
      yield { type: 'agent_text', id: parentCallId, text }
      return
    }

    yield* this.toolEvents(inner, parentCallId)
  }

  private *toolEvents(event: AgentStreamEvent, parent?: string): Generator<ChatChunk> {
    if (event.type === 'beforeToolCallEvent') yield* this.toolStarted(event, parent)
    if (event.type === 'afterToolCallEvent') yield* this.toolFinished(event, parent)
  }

  private *toolStarted(event: Extract<ToolCallEvent, { type: 'beforeToolCallEvent' }>, parent?: string): Generator<ChatChunk> {
    const { name, toolUseId } = event.toolUse

    if (isInternalTool(name)) return

    this.startedAt.set(toolUseId, Date.now())

    const isTopLevelSpecialist = !parent && this.isSpecialist(name)

    if (isTopLevelSpecialist) {
      this.specialistByCall.set(toolUseId, name)
      this.callBySpecialist.set(name, toolUseId)

      const input = String((event.toolUse.input as { input?: unknown })?.input ?? '')
      trace('team', `${name} consultado`, { input: input.slice(0, 240) })

      yield { type: 'agent_start', id: toolUseId, name, input }
      return
    }

    yield { type: 'tool_start', id: toolUseId, name, ...(parent && { parent }) }
  }

  private *toolFinished(event: Extract<ToolCallEvent, { type: 'afterToolCallEvent' }>, parent?: string): Generator<ChatChunk> {
    const { name, toolUseId } = event.toolUse

    if (isInternalTool(name)) return

    const ms = Date.now() - (this.startedAt.get(toolUseId) ?? Date.now())
    this.startedAt.delete(toolUseId)

    const ok = !event.error && event.result.status === 'success'

    const isTopLevelSpecialist = !parent && this.specialistByCall.has(toolUseId)

    if (isTopLevelSpecialist) {
      this.callBySpecialist.delete(name)
      trace('team', `${name} responde`, { ms, ok })

      yield { type: 'agent_end', id: toolUseId, name, ms, ok }
      return
    }

    yield { type: 'tool_end', id: toolUseId, name, ms, ok, ...toolIo(event), ...(parent && { parent }) }
  }
}
