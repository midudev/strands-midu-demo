// Utilidades mínimas sobre los eventos de stream de Strands. Las comparten chat, equipo y enjambre.
import { ModelContentBlockDeltaEvent, ModelStreamUpdateEvent } from '@strands-agents/sdk'

/** Tools internas del SDK (structured output, handoffs del swarm): no se enseñan en la web. */
export const isInternalTool = (name: string) => name.startsWith('strands_')

/** Texto que el modelo acaba de emitir en este evento, o null si el evento es otra cosa (tool, metadata...). */
export function textDelta(event: unknown): string | null {
  if (!(event instanceof ModelStreamUpdateEvent)) return null
  if (!(event.event instanceof ModelContentBlockDeltaEvent)) return null

  const { delta } = event.event

  return delta.type === 'textDelta' ? delta.text : null
}

/** Mensaje legible de cualquier cosa que se haya lanzado o devuelto como error. */
export function errText(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message

  if (typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }

  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
