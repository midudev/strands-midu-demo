// Lectura del historial de un Agent para la web: qué hay en la ventana de conversación y el texto plano de cada turno.
import type { Agent } from '@strands-agents/sdk'

/** Ventana del chat de portada. Pequeña a propósito: en el taller se ve cómo caen mensajes antiguos. */
export const CHAT_WINDOW = 12

/** Mensajes recientes que el chat de sesión conserva intactos al resumir. */
export const RUN_PRESERVE_RECENT = 4

export type ChatKind = 'coach' | 'run'

export interface ContextInfo {
  manager: 'sliding-window' | 'summarizing'
  sessionId: string
  mensajes: number
  /** Tamaño de la ventana (solo sliding-window) */
  ventana: number | null
  /** Mensajes recientes que se conservan (solo summarizing) */
  recientes: number | null
  /** Resumen activo (solo summarizing, y solo tras un reduce) */
  resumen: string | null
}

interface ChatLike {
  kind: ChatKind
  agent: Agent
  sessionId: string
  summary: string | null
}

type MessageLike = { content: Array<unknown> }

/** Concatena los bloques de texto de un mensaje (ignora tools). */
export function messageText(message: MessageLike): string {
  return message.content
    .map((block) => (block && typeof block === 'object' && 'text' in block ? String((block as { text: unknown }).text) : ''))
    .join('')
}

export function contextInfo(chat: ChatLike): ContextInfo {
  const isSliding = chat.kind === 'coach'

  return {
    manager: isSliding ? 'sliding-window' : 'summarizing',
    sessionId: chat.sessionId,
    mensajes: chat.agent.messages.length,
    ventana: isSliding ? CHAT_WINDOW : null,
    recientes: isSliding ? null : RUN_PRESERVE_RECENT,
    resumen: chat.summary,
  }
}

const hasToolBlocks = (message: { content: Array<{ type: string }> }) =>
  message.content.some((block) => block.type === 'toolResultBlock' || block.type === 'toolUseBlock')

/** Solo texto de usuario y coach (sin tools), para repintar el chat al recargar. */
export function chatHistory(agent: Agent, limit = 30) {
  return agent.messages
    .filter((message) => !hasToolBlocks(message))
    .map((message) => ({ role: message.role, text: messageText(message) }))
    .filter((message) => message.text.trim())
    .slice(-limit)
}

/**
 * Cuántos mensajes generó este turno (user + assistant + tools).
 * Si la ventana no recortó, es la diferencia de longitud. Si recortó, contamos desde el último
 * mensaje de usuario "de verdad" (sin toolResult), que es el que abrió el turno.
 */
export function countTurnMessages(agent: Agent, lengthBefore: number): number {
  const added = agent.messages.length - lengthBefore
  if (added > 0) return added

  let index = agent.messages.length - 1

  while (index >= 0) {
    const message = agent.messages[index]!
    const isPlainUser = message.role === 'user' && !hasToolBlocks(message)

    if (isPlainUser) break
    index--
  }

  return Math.max(2, agent.messages.length - index)
}

/** Mensajes que la ventana deslizante ha dejado fuera en este turno. */
export function droppedMessages(agent: Agent, lengthBefore: number): number {
  const expected = lengthBefore + countTurnMessages(agent, lengthBefore)

  return Math.max(0, expected - agent.messages.length)
}
