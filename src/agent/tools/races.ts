// tool() con schema Zod: una función normal con nombre, descripción y schema de entrada.
// El modelo ve nombre, descripción y schema; el callback es código nuestro.
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'

import { distanceKm, getRaces } from '../../lib/races'

export const getUpcomingRaces = tool({
  name: 'get_upcoming_races',
  description:
    'Próximas carreras de running en Catalunya (xipgroc.cat): id, nombre, fecha, distancias disponibles ' +
    'y si las inscripciones están abiertas. Úsala para saber qué carreras hay y sus ids.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(60).default(20),
    raceId: z.string().optional().describe('Si lo indicas, devuelve solo esa carrera'),
  }),
  callback: async ({ limit, raceId }) => {
    const { races, fetchedAt } = await getRaces()

    const selected = raceId ? races.filter((race) => race.id === raceId) : races

    return {
      fuente: 'xipgroc.cat',
      actualizado: fetchedAt,
      carreras: selected.slice(0, limit).map((race) => ({
        ...race,
        // Añadimos los km para que el modelo no tenga que interpretar "Mitja Marató"
        distancias: race.distancias.map((label) => ({ etiqueta: label, km: distanceKm(label) })),
      })),
    }
  },
})
