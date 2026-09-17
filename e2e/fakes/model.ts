// Modelo falso para los tests e2e. Sustituye a src/agent/model.ts (alias en astro.config.mjs con E2E_FAKE_AI=1).
// No llama a ninguna API: decide qué "diría" el modelo mirando el system prompt, las tools disponibles y el último
// mensaje del usuario, y emite los mismos eventos de streaming que emitiría OpenAIModel. Cero tokens gastados.
import {
  Model,
  ModelContentBlockDeltaEvent,
  ModelContentBlockStartEvent,
  ModelContentBlockStopEvent,
  ModelMessageStartEvent,
  ModelMessageStopEvent,
  ModelMetadataEvent,
  type BaseModelConfig,
  type Message,
  type StreamOptions,
} from '@strands-agents/sdk'
import type { ModelStreamEvent } from '@strands-agents/sdk'

export const MODEL_ID = 'fake-model'

/** Qué devuelve el modelo en un turno: texto, o una o varias llamadas a tools. */
type Reply = { text: string } | { tools: Array<{ name: string; input: unknown }> }

const STRUCTURED_OUTPUT = 'strands_structured_output'

const hoy = () => new Date().toISOString().slice(0, 10)
const addDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

// --- Lectura de la conversación ---------------------------------------------------------

type Block = { type: string; text?: string; name?: string; input?: unknown }

const blocksOf = (message: Message) => message.content as unknown as Block[]

const textOf = (message: Message) =>
  blocksOf(message)
    .map((block) => (block.type === 'textBlock' ? block.text ?? '' : ''))
    .join('')

const hasToolResult = (message: Message) => blocksOf(message).some((block) => block.type === 'toolResultBlock')

/** Último mensaje del usuario "de verdad" (texto, no resultado de tool). */
function lastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role === 'user' && !hasToolResult(message)) return textOf(message)
  }
  return ''
}

/** Tools que el agente ya ha llamado en este turno (desde el último mensaje de texto del usuario). */
function calledThisTurn(messages: Message[]): string[] {
  const names: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role === 'user' && !hasToolResult(message)) break
    if (message.role === 'assistant') {
      for (const block of blocksOf(message)) if (block.type === 'toolUseBlock' && block.name) names.push(block.name)
    }
  }
  return names
}

/** Todo el texto de la conversación (para pescar ids que viajan en el encargo o en el context del handoff). */
const allText = (messages: Message[]) => messages.map((m) => JSON.stringify(m.content)).join('\n')

const systemText = (options?: StreamOptions) => {
  const prompt = options?.systemPrompt
  return typeof prompt === 'string' ? prompt : JSON.stringify(prompt ?? '')
}

// --- Fixtures de respuestas ------------------------------------------------------------

export function fakeBriefing() {
  const tipos = ['calidad', 'suave', 'rodaje', 'rodaje', 'suave', 'tirada', 'suave'] as const
  const kms = [12, 6, 10, 10, 6, 22, 5]
  return {
    titular: 'Piernas frescas: hoy toca apretar un poco',
    semaforo: 'apretar',
    motivo: 'Recuperación al 100% y ratio de carga 0.90: margen para calidad.',
    sesion: {
      nombre: 'Bloque a ritmo de maratón',
      bloques: [
        { tipo: 'calentamiento', km: 3, ritmo: '5:00' },
        { tipo: 'maraton', km: 8, ritmo: '4:05-4:10', nota: 'ritmo Valencia' },
        { tipo: 'enfriamiento', km: 1, ritmo: '5:20' },
      ],
    },
    semana: tipos.map((tipo, i) => ({
      fecha: addDays(i),
      tipo,
      km: kms[i],
      resumen: `${kms[i]} km ${tipo}`,
    })),
    diasParaObjetivo: Math.round((Date.parse('2026-12-06') - Date.parse(hoy())) / 86400_000),
  }
}

const raceIdFrom = (messages: Message[]) => {
  const text = allText(messages)
  return /\(id ([^,)]+),/.exec(text)?.[1] ?? /raceId[\\"':\s]+([\w-]+)/.exec(text)?.[1] ?? 'desconocida'
}

function fakePrediction(raceId: string) {
  return {
    raceId,
    nombre: 'Carrera de prueba',
    fecha: addDays(20),
    distancia: '10K',
    distanciaKm: 10,
    // COROS "predice" 37:30 para 10K en el servidor falso: nunca más optimista que el reloj
    tiempoEstimado: '38:00',
    ritmoEstimado: '3:48',
    confianza: 'media',
    recomendacion: 'tempo',
    motivo: 'Predicción de prueba: 30 s por encima de la estimación de COROS por la carga reciente.',
    claves: ['Salir conservador', 'Negative split', 'Gel en el km 6'],
    encajeConObjetivo: 'Sirve como tempo largo dentro del bloque específico.',
  }
}

// --- La política: qué responde el modelo según quién le pregunta ------------------------

function decide(messages: Message[], options?: StreamOptions): Reply {
  const tools = new Set((options?.toolSpecs ?? []).map((spec) => spec.name))
  const system = systemText(options)
  const user = lastUserText(messages)
  const lower = user.toLowerCase()
  const called = calledThisTurn(messages)
  const wantsStructured = tools.has(STRUCTURED_OUTPUT)
  const schema = (options?.toolSpecs ?? []).find((spec) => spec.name === STRUCTURED_OUTPUT)?.inputSchema as
    | { properties?: Record<string, unknown> }
    | undefined

  // Simulación de fallo del modelo: sirve para probar el camino de error de la web
  if (lower.includes('provoca un error')) throw new Error('Fallo simulado del modelo')

  // 1. Briefing diario (structured output con el schema Briefing)
  if (wantsStructured && schema?.properties?.semaforo) {
    if (!called.includes('queryTrainingLoadAssessment') && tools.has('queryTrainingLoadAssessment')) {
      return { tools: [{ name: 'queryTrainingLoadAssessment', input: { days: 7 } }] }
    }
    return { tools: [{ name: STRUCTURED_OUTPUT, input: fakeBriefing() }] }
  }

  // 2. Enjambre de predicción (structured output con el schema de handoff: agentId/message/context)
  if (wantsStructured && schema?.properties?.agentId) {
    const raceId = raceIdFrom(messages)
    const handoff = (agentId: string | undefined, message: string, context: Record<string, unknown>) => ({
      tools: [{ name: STRUCTURED_OUTPUT, input: { ...(agentId && { agentId }), message, context: { raceId, ...context } } }],
    })

    if (system.includes('Eres el analista')) {
      if (!called.includes('queryFitnessAssessmentOverview')) {
        return { tools: [{ name: 'queryFitnessAssessmentOverview', input: {} }] }
      }
      if (!called.includes('get_upcoming_races')) {
        return { tools: [{ name: 'get_upcoming_races', input: { raceId, limit: 5 } }] }
      }
      return handoff('optimista', 'Datos recogidos: COROS estima 37:30 en 10K, recuperación 100%.', {
        distanciaKm: 10,
        prediccionCoros: '37:30',
        vo2max: 58,
        recuperacion: 100,
      })
    }
    if (system.includes('Eres el optimista')) {
      return handoff('conservador', 'Si el día sale perfecto, 37:15 con negative split.', { tiempoOptimista: '37:15' })
    }
    if (system.includes('Eres el conservador')) {
      return handoff('arbitro', 'Con la carga reciente, 38:00 y como tempo, no a competir.', {
        tiempoConservador: '38:00',
        recomendacion: 'tempo',
      })
    }
    if (system.includes('Eres el árbitro')) {
      if (!called.includes('save_race_prediction')) {
        return { tools: [{ name: 'save_race_prediction', input: fakePrediction(raceId) }] }
      }
      return handoff(undefined, 'Predicción guardada: 38:00 como tempo controlado.', { tiempoFinal: '38:00' })
    }
    throw new Error(`Modelo falso: nodo del enjambre desconocido`)
  }

  if (wantsStructured) throw new Error('Modelo falso: structured output desconocido')

  // 3. Extracción de memoria a largo plazo (FileMemoryStore): devuelve un array JSON de hechos
  if (system.includes('Extraes hechos duraderos')) {
    const transcript = user.toLowerCase()
    if (!transcript.includes('molestia')) return { text: '[]' }
    return { text: JSON.stringify([{ content: '# Lesiones y molestias\nMolestia en la rodilla izquierda (mock).' }]) }
  }

  // 4. Resumen del historial (SummarizingConversationManager)
  if (system.includes('Resume esta conversación')) {
    return { text: '- Resumen de prueba: el corredor preguntó por la sesión y el coach respondió con datos (mock).' }
  }

  // 5. Especialistas del equipo (opinión diaria, por sesión o como tool del coach)
  // (el prompt común del equipo los distingue del coach del chat, que también "es el entrenador")
  const isTeamMember = system.includes('Formas parte del equipo del entrenador')
  const specialist = isTeamMember
    ? (['fisioterapeuta', 'nutricionista', 'entrenador'] as const).find((who) => system.includes(`Eres el ${who}.`))
    : undefined
  if (specialist) {
    const first = { fisioterapeuta: 'queryRecoveryStatus', nutricionista: 'querySportRecords', entrenador: 'queryFitnessAssessmentOverview' }[specialist]
    if (!called.includes(first) && tools.has(first)) return { tools: [{ name: first, input: first === 'querySportRecords' ? { limit: 10 } : {} }] }
    return {
      text:
        `Opinión de prueba del ${specialist}: te veo **bien** según COROS.\n\n` +
        `Recomendación: *mantén* el plan de hoy y vigila las sensaciones.`,
    }
  }

  // 6. La bienvenida: pregunta hasta que el corredor se presenta, entonces guarda el perfil y se despide
  if (system.includes('Eres el coach de running que da la bienvenida')) {
    if (called.includes('guardar_perfil')) return { text: 'Perfecto, Ana. Ya tengo todo para prepararte el panel. Vamos a por esa media.' }
    if (lower.includes('me llamo') && tools.has('guardar_perfil')) {
      return {
        tools: [
          {
            name: 'guardar_perfil',
            input: {
              nombre: 'Ana',
              ciudad: 'Barcelona',
              objetivo: { carrera: 'Mitja Marató de Barcelona', fecha: addDays(120), distanciaKm: 21.0975, tiempo: '1:45:00' },
              diasPorSemana: 4,
              notas: ['Molestia en el sóleo derecho (mock)'],
            },
          },
        ],
      }
    }
    return { text: 'Encantado. ¿Cómo te llamas y qué carrera preparas?' }
  }

  // 7. El coach del chat (portada y /runs/:id)
  if (lower.includes('molestia') || lower.includes('dolor') || lower.includes('fisio')) {
    if (!called.includes('fisio') && tools.has('fisio')) {
      return { tools: [{ name: 'fisio', input: { input: `el corredor dice: ${user}` } }] }
    }
    return { text: 'Ahí lo tienes: hoy trote suave y mañana vemos.' }
  }
  if (lower.includes('tirada larga')) {
    if (!called.includes('guardar_preferencia') && tools.has('guardar_preferencia')) {
      return { tools: [{ name: 'guardar_preferencia', input: { clave: 'dia_tirada_larga', valor: 'domingo' } }] }
    }
    return { text: 'Apuntado: tu tirada larga es el domingo.' }
  }
  if (lower.includes('entrenos') || lower.includes('semana')) {
    if (!called.includes('querySportRecords') && tools.has('querySportRecords')) {
      return { tools: [{ name: 'querySportRecords', input: { startDate: '20260901', endDate: '20260930', sportTypeCodes: [100], limit: 10 } }] }
    }
    return { text: 'He mirado tus entrenos: 3 salidas y 31.5 km. Vas bien.' }
  }
  if (lower.includes('carrera')) {
    if (!called.includes('get_upcoming_races') && tools.has('get_upcoming_races')) {
      return { tools: [{ name: 'get_upcoming_races', input: { limit: 5 } }] }
    }
    return { text: 'Te recomiendo la 10K de prueba como tempo.' }
  }

  return { text: `Respuesta del coach (mock): ${user}` }
}

// --- El Model de Strands -----------------------------------------------------------------

let nextId = 1

export class FakeModel extends Model<BaseModelConfig> {
  private config: BaseModelConfig = { modelId: MODEL_ID, contextWindowLimit: 200_000 }

  updateConfig(config: BaseModelConfig) {
    this.config = { ...this.config, ...config }
  }

  getConfig() {
    return this.config
  }

  async *stream(messages: Message[], options?: StreamOptions): AsyncIterable<ModelStreamEvent> {
    const reply = decide(messages, options)

    yield new ModelMessageStartEvent({ type: 'modelMessageStartEvent', role: 'assistant' })

    if ('text' in reply) {
      yield new ModelContentBlockStartEvent({ type: 'modelContentBlockStartEvent' })
      // En trozos, para que la web ejercite el streaming de verdad
      for (const chunk of reply.text.match(/.{1,24}/gs) ?? ['']) {
        yield new ModelContentBlockDeltaEvent({ type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: chunk } })
      }
      yield new ModelContentBlockStopEvent({ type: 'modelContentBlockStopEvent' })
      yield new ModelMessageStopEvent({ type: 'modelMessageStopEvent', stopReason: 'endTurn' })
    } else {
      for (const call of reply.tools) {
        const toolUseId = `fake-${nextId++}`
        yield new ModelContentBlockStartEvent({ type: 'modelContentBlockStartEvent', start: { type: 'toolUseStart', name: call.name, toolUseId } })
        yield new ModelContentBlockDeltaEvent({ type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: JSON.stringify(call.input) } })
        yield new ModelContentBlockStopEvent({ type: 'modelContentBlockStopEvent' })
      }
      yield new ModelMessageStopEvent({ type: 'modelMessageStopEvent', stopReason: 'toolUse' })
    }

    yield new ModelMetadataEvent({ type: 'modelMetadataEvent', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } })
  }
}

export const model = new FakeModel()
