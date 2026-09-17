// Briefing diario: una invocación con structured output.
// La respuesta va a la UI, así que pedimos un objeto (schema Briefing), no un texto.
import { readTodayBriefing, saveBriefing, type StoredBriefing } from '../lib/briefing'
import { diasParaObjetivo, requireRunnerProfile } from '../lib/runner'
import { hoy } from '../lib/running'
import { trace } from '../lib/trace'

import { createCoach } from './coach'
import { briefingAsk } from './prompts/coach'
import { Briefing } from './schema'

/** El briefing de hoy: de caché si ya existe, generado por el coach si no (o si `refresh`). */
export async function dailyBriefing({ refresh = false } = {}): Promise<StoredBriefing> {
  const cached = refresh ? null : readTodayBriefing()
  if (cached) return cached

  const startedAt = Date.now()
  const runner = requireRunnerProfile()
  const fecha = hoy()
  const dias = diasParaObjetivo(runner, fecha)

  trace('coach', refresh ? 'briefing regenerar' : 'briefing generar', { fecha, objetivo: runner.objetivo.carrera })

  const coach = createCoach()

  try {
    // structuredOutputSchema: el SDK obliga al modelo a devolver un objeto válido según el schema
    const result = await coach.invoke(briefingAsk(fecha, dias, runner), { structuredOutputSchema: Briefing })

    const briefing = saveBriefing({
      ...(result.structuredOutput as Briefing),
      diasParaObjetivo: dias,
      fecha,
      toolsUsadas: (result.invocationState?.toolsUsadas as string[] | undefined) ?? [],
    })

    trace('coach', 'briefing ok', { titular: briefing.titular, toolsUsadas: briefing.toolsUsadas, ms: Date.now() - startedAt })

    return briefing
  } catch (err) {
    trace('coach', 'briefing error', { error: String((err as Error).message), ms: Date.now() - startedAt }, 'error')
    throw err
  }
}
