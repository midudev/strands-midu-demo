// Traduce los eventos de swarm.stream() a los chunks que pinta la web y acumula el recorrido (pasos) del enjambre.
import type { MultiAgentStreamEvent } from '@strands-agents/sdk/multiagent'

import type { StoredPrediction, SwarmStep } from './predictions'
import { isInternalTool } from './stream'
import { trace } from './trace'

export type SwarmChunk =
  | { type: 'node_start'; node: string; step: number }
  | { type: 'tool_start'; node: string; id: string; name: string }
  | { type: 'tool_end'; node: string; id: string; name: string; ms: number; ok: boolean }
  | { type: 'handoff'; from: string; to: string | null; message: string; context: Record<string, unknown> | null; ms: number }
  | { type: 'result'; prediction: StoredPrediction }
  | { type: 'error'; message: string }

/** Lo que cada nodo devuelve como structured output para pasar el testigo. */
interface Handoff {
  agentId?: string
  message?: string
  context?: Record<string, unknown>
}

type NodeStartEvent = Extract<MultiAgentStreamEvent, { type: 'beforeNodeCallEvent' }>
type NodeStreamEvent = Extract<MultiAgentStreamEvent, { type: 'nodeStreamUpdateEvent' }>
type NodeResultEvent = Extract<MultiAgentStreamEvent, { type: 'nodeResultEvent' }>

/** Una instancia por predicción. Cuando el stream acaba, `steps` es el recorrido completo. */
export class SwarmEventTranslator {
  readonly steps: SwarmStep[] = []

  private stepNumber = 0
  private nodeStartedAt = 0

  /** toolUseId → instante en que empezó la tool */
  private toolStartedAt = new Map<string, number>()

  /** nodo → tools que ha usado en su paso actual */
  private toolsByNode = new Map<string, string[]>()

  get pasos() {
    return this.stepNumber
  }

  *translate(event: MultiAgentStreamEvent): Generator<SwarmChunk> {
    if (event.type === 'beforeNodeCallEvent') yield* this.nodeStarted(event)
    else if (event.type === 'nodeStreamUpdateEvent') yield* this.nodeStreamed(event)
    else if (event.type === 'nodeResultEvent') yield* this.nodeFinished(event)
  }

  private *nodeStarted(event: NodeStartEvent): Generator<SwarmChunk> {
    this.stepNumber += 1
    this.nodeStartedAt = Date.now()
    this.toolsByNode.set(event.nodeId, [])

    trace('swarm', `nodo ${event.nodeId} empieza`, { paso: this.stepNumber })

    yield { type: 'node_start', node: event.nodeId, step: this.stepNumber }
  }

  /** Eventos internos del agente que está trabajando: solo nos interesan sus tools. */
  private *nodeStreamed(event: NodeStreamEvent): Generator<SwarmChunk> {
    if (event.inner.source !== 'agent') return

    const inner = event.inner.event
    const node = event.nodeId

    if (inner.type === 'beforeToolCallEvent') {
      const { name, toolUseId } = inner.toolUse
      if (isInternalTool(name)) return

      this.toolStartedAt.set(toolUseId, Date.now())

      yield { type: 'tool_start', node, id: toolUseId, name }
    }

    if (inner.type === 'afterToolCallEvent') {
      const { name, toolUseId } = inner.toolUse
      if (isInternalTool(name)) return

      const ms = Date.now() - (this.toolStartedAt.get(toolUseId) ?? Date.now())
      const ok = !inner.error && inner.result.status === 'success'

      this.toolsByNode.get(node)?.push(name)

      yield { type: 'tool_end', node, id: toolUseId, name, ms, ok }
    }
  }

  /** El nodo ha terminado: registramos el paso y pintamos el handoff. */
  private *nodeFinished(event: NodeResultEvent): Generator<SwarmChunk> {
    const handoff = (event.result.structuredOutput ?? {}) as Handoff
    const ms = Date.now() - this.nodeStartedAt

    const plainText = event.result.content.map((block) => ('text' in block ? String(block.text) : '')).join('')

    const step: SwarmStep = {
      agente: event.nodeId,
      paso: this.stepNumber,
      ms,
      tools: this.toolsByNode.get(event.nodeId) ?? [],
      mensaje: handoff.message ?? plainText,
      contexto: handoff.context ?? null,
      siguiente: handoff.agentId ?? null,
    }

    this.steps.push(step)

    trace('swarm', `nodo ${event.nodeId} → ${step.siguiente ?? 'fin'}`, {
      ms,
      tools: step.tools,
      message: step.mensaje,
      context: step.contexto,
    })

    yield { type: 'handoff', from: event.nodeId, to: step.siguiente, message: step.mensaje, context: step.contexto, ms }
  }
}
