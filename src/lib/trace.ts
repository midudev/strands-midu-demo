// Trazas en memoria del servidor. La página /debug las lee por /api/debug y las pinta en vivo.
export type TraceLevel = 'debug' | 'info' | 'warn' | 'error'

export interface TraceEvent {
  id: number
  ts: string
  /** De qué parte viene: 'chat', 'swarm', 'coros', 'guardrail', 'http'... */
  scope: string
  level: TraceLevel
  message: string
  data?: unknown
}

/** Cuántas trazas guardamos como máximo; al superarlo, caen las más antiguas. */
const MAX_EVENTS = 400

/** Strings más largos que esto se recortan al guardar la traza. */
const MAX_STRING = 800

const MAX_ARRAY_ITEMS = 20
const MAX_OBJECT_KEYS = 24
const MAX_DEPTH = 3

const SENSITIVE_KEY = /token|secret|password|verifier|authorization|api[_-]?key/i

const events: TraceEvent[] = []
let nextId = 1

/** Copia recortada y sin secretos de cualquier valor, para que las trazas no crezcan sin control. */
function clip(value: unknown, depth = 0): unknown {
  if (value == null) return value

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
  }

  if (typeof value !== 'object') return value

  if (depth > MAX_DEPTH) return '[…]'

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => clip(item, depth + 1))
  }

  const clipped: Record<string, unknown> = {}
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)

  for (const [key, item] of entries) {
    if (SENSITIVE_KEY.test(key)) {
      clipped[key] = item == null ? item : '[redacted]'
      continue
    }

    clipped[key] = clip(item, depth + 1)
  }

  return clipped
}

/** Registra una traza. `data` se recorta y se limpia de secretos antes de guardarse. */
export function trace(scope: string, message: string, data?: unknown, level: TraceLevel = 'info') {
  const event: TraceEvent = {
    id: nextId++,
    ts: new Date().toISOString(),
    scope,
    level,
    message,
    ...(data !== undefined ? { data: clip(data) } : {}),
  }

  events.push(event)

  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS)
  }

  return event
}

/** Trazas con id mayor que `after` (para que /debug solo pida las nuevas). */
export function getTraces(after = 0) {
  return after > 0 ? events.filter((event) => event.id > after) : events.slice()
}

export function clearTraces() {
  events.length = 0
}

export function tracesMeta() {
  return {
    count: events.length,
    lastId: events.at(-1)?.id ?? 0,
    cap: MAX_EVENTS,
  }
}
