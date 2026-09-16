// Los cuatro agentes del enjambre de predicción y el encargo inicial. Solo texto: sin Strands.
import type { Race } from '../../lib/races'
import { VALENCIA } from '../../lib/running'

const COMMON = `
Formas parte de un enjambre de agentes que predice cómo hará midu (@midu.run, Barcelona) una carrera.
Objetivo de fondo: Maratón de Valencia, ${VALENCIA}, bajar de 2:55 (4:08/km). Corre todos los días.
Hablas en español, con cifras. Sé breve: tu "message" son 2 a 4 frases para el siguiente agente.
En "context" pasa siempre datos estructurados y compactos (números, tiempos "mm:ss" o "h:mm:ss", fuentes; nada de objetos enteros)
para que nadie tenga que repetir consultas.
`.trim()

// --- Los cuatro agentes ----------------------------------------------------------------------

export interface SwarmAgentDef {
  id: string
  nombre: string
  descripcion: string
  prompt: string
  /** Solo el árbitro puede guardar la predicción */
  withSave?: boolean
}

export const SWARM_AGENTS: SwarmAgentDef[] = [
  {
    id: 'analista',
    nombre: 'Analista',
    descripcion: 'Recoge los datos reales: fitness de COROS, carga, recuperación, últimos entrenos y la ficha de la carrera. No opina.',
    prompt: `${COMMON}
Eres el analista. Consulta SIEMPRE queryFitnessAssessmentOverview, queryTrainingLoadAssessment, queryRecoveryStatus,
querySportRecords (últimos 14 días, códigos [100,101,102,103]) y get_upcoming_races con el raceId.
Elige la distancia que más le convenga a midu entre las de la carrera. Resume en context: distanciaKm, prediccionCoros para esa
distancia (interpola con Riegel si no es estándar), vo2max, ritmoUmbral, kmUltimos7dias, recuperacion, carga, diasHastaValencia.
Pasa el testigo al optimista.`,
  },
  {
    id: 'optimista',
    nombre: 'Optimista',
    descripcion: 'Propone el mejor tiempo razonable si el día sale perfecto, con estrategia de ritmo.',
    prompt: `${COMMON}
Eres el optimista. Con el context del analista (no vuelvas a consultar COROS salvo que falte algo), propón el tiempo más ambicioso
que sea creíble: como mucho un 1% mejor que la predicción de COROS. Explica el porqué y el plan de ritmos (negative split).
Pasa el testigo al conservador con tu propuesta en context.tiempoOptimista.`,
  },
  {
    id: 'conservador',
    nombre: 'Conservador',
    descripcion: 'Cuestiona la propuesta: carga, recuperación, cercanía a Valencia. Propone el tiempo seguro y la recomendación (competir, tempo, social, evitar).',
    prompt: `${COMMON}
Eres el conservador. Revisa la propuesta del optimista con la carga, la recuperación y los días hasta Valencia.
Nunca recomiendes "competir" en ≥10 km entre 3 semanas antes y 2 después del maratón. Propón tu tiempo (context.tiempoConservador)
y tu recomendación (context.recomendacion). Si el optimista se pasó de más de un 3%, díselo claramente.
Pasa el testigo al árbitro.`,
  },
  {
    id: 'arbitro',
    nombre: 'Árbitro',
    descripcion: 'Decide el tiempo final entre las dos propuestas y guarda la predicción con save_race_prediction.',
    prompt: `${COMMON}
Eres el árbitro. Tienes en context las dos propuestas y los datos. Decide un tiempo final (normalmente entre ambas, más cerca
del conservador si la recuperación es baja) y la recomendación. Llama a save_race_prediction con todos los campos.
Si el guardrail rechaza el guardado, corrige y vuelve a llamar. Si te falta un dato imprescindible, devuelve el testigo al analista
diciendo exactamente qué falta. Cuando esté guardado, termina SIN handoff: tu message final es un resumen de una frase.`,
    withSave: true,
  },
]

// --- Helpers y encargo -----------------------------------------------------------------------

export const SWARM_AGENT_IDS = SWARM_AGENTS.map((a) => a.id)

/** Encargo inicial del enjambre (lo recibe el analista). */
export const swarmAsk = (race: Race) =>
  `Predice cómo haría midu la carrera "${race.nombre}" (id ${race.id}, ${race.fecha}, distancias: ${race.distancias.join(', ') || 'sin detallar'}). ` +
  'Empieza recogiendo los datos reales.'
