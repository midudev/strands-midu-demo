// Briefing diario: una invocación con structured output.
// La respuesta va a la UI, así que pedimos un objeto (schema Briefing), no un texto.
import { readTodayBriefing, saveBriefing, type StoredBriefing } from '../lib/briefing'
import { diasParaValencia, hoy } from '../lib/running'
import { trace } from '../lib/trace'

import { createCoach } from './coach'
import { briefingAsk } from './prompts/coach'
import { Briefing } from './schema'

/** El briefing de hoy: de caché si ya existe, generado por el coach si no (o si `refresh`). */
export async function dailyBriefing({ refresh = false } = {}): Promise<StoredBriefing> {
  const cached = refresh ? null : readTodayBriefing()
  if (cached) return cached

  const startedAt = Date.now()
  const fecha = hoy()
  const dias = diasParaValencia(fecha)

  trace('coach', refresh ? 'briefing regenerar' : 'briefing generar', { fecha })

  const coach = createCoach()

  try {
    // structuredOutputSchema: el SDK obliga al modelo a devolver un objeto válido según el schema
    const result = await coach.invoke(briefingAsk(fecha, dias), { structuredOutputSchema: Briefing })

    const briefing = saveBriefing({
      ...(result.structuredOutput as Briefing),
      diasParaValencia: dias,
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
