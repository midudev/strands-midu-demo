// El chat: agent.stream() con las cuatro capas que lo hacen "personal":
//   - ConversationManager: cómo se recorta el historial (SlidingWindow en portada, Summarizing en /runs/:id)
//   - SessionManager: dónde se persiste (reinicia el servidor y el chat sigue)
//   - appState: estado fuera del contexto del modelo (preferencias, contadores)
//   - MemoryManager: hechos a largo plazo entre sesiones
import {
  Agent,
  BeforeInvocationEvent,
  SlidingWindowConversationManager,
  SummarizingConversationManager,
  type ConversationManager,
  type MemoryManager,
} from '@strands-agents/sdk'

import { ChatEventTranslator, type ChatChunk } from '../lib/chat-events'
import {
  CHAT_WINDOW,
  RUN_PRESERVE_RECENT,
  chatHistory,
  contextInfo,
  droppedMessages,
  messageText,
  type ChatKind,
} from '../lib/chat-history'
import { memoryStats } from '../lib/memory-files'
import { trace } from '../lib/trace'

import { coachTools } from './coach'
import { getRunDetail } from './coros/data'
import { addGuardrails } from './guardrails'
import { createMemory } from './memory'
import { model } from './model'
import { HEAD_COACH_PROMPT, SUMMARY_PROMPT, runCoachPrompt } from './prompts/coach'
import { isChatSpecialist } from './prompts/team'
import { createSession } from './session'
import { addTeamHook, teamTools } from './team'
import { guardarPreferencia, readCoachState, verPreferencias } from './tools/state'

export interface ChatAgent {
  kind: ChatKind
  agent: Agent
  manager: ConversationManager
  sessionId: string
  /** Resumen activo (solo Summarizing); lo guardamos para enseñarlo en la web */
  summary: string | null
  memory?: MemoryManager
  /** Se resuelve cuando agent.initialize() ha restaurado la sesión de disco */
  ready: Promise<void>
}

/** Fracción del historial que el Summarizing resume cuando toca recortar. */
const SUMMARY_RATIO = 0.6

// Los agentes viven en memoria mientras el servidor está arriba; su historial vive en disco (sesión).
let coachChat: ChatAgent | undefined
const runChats = new Map<string, ChatAgent>()

// --- Construcción de los agentes -------------------------------------------------------

/** El chat de portada. Un único agente: es el coach personal de una sola persona. */
export function getChatAgent(): ChatAgent {
  if (coachChat) return coachChat

  const sessionId = 'coach-chat'

  // Ventana deslizante: cuando hay más de CHAT_WINDOW mensajes, los más antiguos caen
  const manager = new SlidingWindowConversationManager({ windowSize: CHAT_WINDOW, shouldTruncateResults: true })
  const memory = createMemory()

  const agent = new Agent({
    id: 'coach',
    name: 'coach',
    model,
    systemPrompt: HEAD_COACH_PROMPT,
    tools: [...coachTools(), ...teamTools(), guardarPreferencia, verPreferencias],
    conversationManager: manager,
    sessionManager: createSession(sessionId),
    memoryManager: memory,
    printer: false,
  })

  addGuardrails(agent)
  addTeamHook(agent)

  // Estado del agente: contadores que la app mantiene fuera de la conversación (se persisten con la sesión)
  agent.addHook(BeforeInvocationEvent, () => {
    const turnos = (agent.appState.get('turnos') as number | undefined) ?? 0

    agent.appState.set('turnos', turnos + 1)
    agent.appState.set('ultimaConsulta', new Date().toISOString())
  })

  const ready = agent.initialize().then(() => {
    trace('session', 'coach restaurado', {
      sessionId,
      mensajes: agent.messages.length,
      turnos: agent.appState.get('turnos') ?? 0,
    })
  })

  coachChat = { kind: 'coach', agent, manager, sessionId, summary: null, memory, ready }

  return coachChat
}

/** Chat sobre una sesión concreta. Cuando toca recortar, resume lo viejo con el modelo en vez de tirarlo. */
export async function getRunChatAgent(runId: string): Promise<ChatAgent> {
  const existing = runChats.get(runId)
  if (existing) return existing

  const run = await getRunDetail(runId)
  if (!run) throw new Error('Carrera no encontrada')

  const sessionId = `run-${runId}`

  const manager = new SummarizingConversationManager({
    model,
    preserveRecentMessages: RUN_PRESERVE_RECENT,
    summaryRatio: SUMMARY_RATIO,
    summarizationSystemPrompt: SUMMARY_PROMPT,
  })

  const agent = new Agent({
    id: sessionId,
    model,
    systemPrompt: runCoachPrompt(run),
    tools: [...coachTools(), ...teamTools()],
    conversationManager: manager,
    sessionManager: createSession(sessionId),
    printer: false,
  })

  addGuardrails(agent)
  addTeamHook(agent)

  const ready = agent.initialize().then(() => {
    trace('session', 'chat de sesión restaurado', { sessionId, mensajes: agent.messages.length })
  })

  const chat: ChatAgent = { kind: 'run', agent, manager, sessionId, summary: null, ready }
  runChats.set(runId, chat)

  return chat
}

/** El chat que toca (portada o sesión), ya inicializado. */
async function getReadyChat(runId?: string): Promise<ChatAgent> {
  const chat = runId ? await getRunChatAgent(runId) : getChatAgent()
  await chat.ready

  return chat
}

export const isChatActive = () => coachChat !== undefined || runChats.size > 0

/** Descarta los agentes de memoria. La sesión en disco sigue: al volver, se restaura. */
export function resetChat() {
  if (coachChat || runChats.size) {
    trace('chat', 'agentes descartados de memoria (la sesión en disco sigue)')
  }

  coachChat = undefined
  runChats.clear()
}

// --- Streaming -------------------------------------------------------------------------

/** Un turno de chat en streaming. Cada evento del SDK se traduce a un chunk para la web. */
export async function* streamChat(message: string, opts: { runId?: string } = {}): AsyncGenerator<ChatChunk> {
  const startedAt = Date.now()
  trace('chat', 'mensaje', { preview: message.slice(0, 240), runId: opts.runId })

  const chat = await getReadyChat(opts.runId)
  const { agent } = chat

  const messagesBefore = agent.messages.length
  const translator = new ChatEventTranslator(isChatSpecialist)

  try {
    for await (const event of agent.stream(message)) {
      yield* translator.translate(event)
    }

    // Al terminar el turno contamos la ventana: cuántos mensajes hay y cuántos han caído
    const context = contextInfo(chat)
    const cayeron = droppedMessages(agent, messagesBefore)

    if (cayeron > 0) {
      trace('context', `ventana deslizante: ${cayeron} mensajes fuera`, { mensajes: context.mensajes, ventana: context.ventana })
    }

    yield { type: 'context', context, cayeron }

    trace('chat', 'fin', { ms: Date.now() - startedAt, mensajes: context.mensajes })

    yield { type: 'done' }

    // La extracción de memoria corre en segundo plano tras la invocación; dejamos traza de cuándo acaba
    chat.memory
      ?.flush()
      .then(() => trace('memory', 'extracción terminada', memoryStats()))
      .catch((err) => trace('memory', 'extracción falló', { error: String((err as Error).message) }, 'warn'))
  } catch (err) {
    trace('chat', 'error', { error: String((err as Error).message), ms: Date.now() - startedAt }, 'error')
    throw err
  }
}

// --- Contexto, sesión y estado (lo que enseña la web) ----------------------------------

/** Fuerza al ConversationManager a reducir el historial (lo que haría solo al llenarse el contexto). */
export async function compressContext(opts: { runId?: string } = {}) {
  const chat = await getReadyChat(opts.runId)
  const { agent } = chat

  const messagesBefore = agent.messages.length
  const reducido = await chat.manager.reduce({ agent, model })

  if (reducido) {
    // El Summarizing deja el resumen como primer mensaje: lo guardamos para enseñarlo
    if (chat.kind === 'run') {
      chat.summary = messageText(agent.messages[0] ?? { content: [] }) || null
    }

    // El SessionManager guarda solo tras cada invocación; como esto es manual, persistimos el recorte a mano
    await agent.sessionManager?.saveSnapshot({ target: agent, isLatest: true })
  }

  trace('context', `reduce ${chat.kind}`, {
    sessionId: chat.sessionId,
    antes: messagesBefore,
    despues: agent.messages.length,
    reducido,
  })

  return { reducido, antes: messagesBefore, ...contextInfo(chat) }
}

export async function getContext(opts: { runId?: string } = {}) {
  const chat = await getReadyChat(opts.runId)

  return { ...contextInfo(chat), historial: chatHistory(chat.agent) }
}

export async function getCoachState() {
  const chat = await getReadyChat()

  return {
    ...readCoachState(chat.agent.appState),
    sessionId: chat.sessionId,
    mensajes: chat.agent.messages.length,
  }
}
