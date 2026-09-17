// Schemas Zod que el modelo debe rellenar. Los `describe()` llegan al modelo: son parte del prompt.
import { z } from 'zod'

const tiempo = z
  .string()
  .regex(/^(\d+:)?\d{1,2}:\d{2}$/)
  .describe('Tiempo h:mm:ss o mm:ss, p. ej. "37:30" o "1:21:00"')

const ritmo = z
  .string()
  .regex(/^\d:\d{2}$/)
  .describe('Ritmo min/km, p. ej. "3:45"')

const ritmoRango = z
  .string()
  .regex(/^\d:\d{2}([–-]\d:\d{2})?$/)
  .describe('Ritmo min/km o rango, p. ej. "4:15" o "4:50–5:10"')

// --- Predicción de carrera (tool save_race_prediction) ---------------------------------

export const RacePrediction = z.object({
  raceId: z.string().describe('id de la carrera tal y como lo devuelve get_upcoming_races'),
  nombre: z.string(),
  fecha: z.string().describe('YYYY-MM-DD'),
  distancia: z.string().describe('Distancia elegida entre las que ofrece la carrera, p. ej. "10K"'),
  distanciaKm: z.number(),
  tiempoEstimado: tiempo,
  ritmoEstimado: ritmo,
  confianza: z.enum(['alta', 'media', 'baja']),
  recomendacion: z.enum(['competir', 'tempo', 'social', 'evitar']),
  motivo: z.string().describe('Una o dos frases: por qué ese tiempo y esa recomendación'),
  claves: z.array(z.string()).max(3).describe('Consejos concretos para el día de la carrera'),
  encajeConObjetivo: z.string().describe('Cómo encaja en la preparación de la carrera objetivo'),
})

export type RacePrediction = z.infer<typeof RacePrediction>

// --- Briefing diario (structured output) ------------------------------------------------

export const BloqueSesion = z.object({
  tipo: z
    .enum(['calentamiento', 'suave', 'maraton', 'umbral', 'series', 'enfriamiento'])
    .describe('Intensidad del bloque. "maraton" = ritmo objetivo de maratón, "umbral" = tempo, "series" = repeticiones rápidas'),
  km: z.number().positive().describe('Kilómetros del bloque (en series, la suma de las repeticiones rápidas)'),
  ritmo: ritmoRango,
  nota: z.string().max(40).optional().describe('Solo si aporta: "6×1000 rec 2\'", "en cuestas"…'),
})

export type BloqueSesion = z.infer<typeof BloqueSesion>

export const DiaPlan = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z
    .enum(['descanso', 'suave', 'rodaje', 'calidad', 'tirada'])
    .describe('descanso = 0 km (solo si el corredor no corre ese día), suave = trote de recuperación, rodaje = fácil normal, calidad = ritmo/umbral/series, tirada = larga'),
  km: z.number().min(0).describe('Kilómetros del día. 0 solo en un día de descanso; si el corredor corre todos los días, nunca 0'),
  resumen: z.string().max(48).describe('Muy corto, p. ej. "8 km fácil" o "12 km con 6×1000"'),
})

export type DiaPlan = z.infer<typeof DiaPlan>

export const Briefing = z.object({
  titular: z.string().max(90).describe('Una frase corta (máx. 12 palabras) sobre cómo llega el corredor hoy'),
  semaforo: z.enum(['apretar', 'controlar', 'suave']).describe('Veredicto del día según carga y recuperación'),
  motivo: z.string().max(140).describe('Una frase con las cifras clave de COROS que justifican el semáforo'),
  sesion: z.object({
    nombre: z.string().max(40).describe('Nombre corto de la sesión, p. ej. "Bloque a ritmo de maratón"'),
    bloques: z.array(BloqueSesion).min(1).max(8).describe('En orden: calentamiento, parte principal, enfriamiento'),
  }),
  semana: z
    .array(DiaPlan)
    .length(7)
    .describe('Plan de los próximos 7 días empezando HOY. El de hoy coincide con la sesión. Máximo 2 días de calidad.'),
  diasParaObjetivo: z.number().int(),
})

export type Briefing = z.infer<typeof Briefing>

// --- Perfil del corredor (tool guardar_perfil de la bienvenida) --------------------------

export const RunnerProfileInput = z.object({
  nombre: z.string().min(1).max(40).describe('Cómo quiere que le llamen'),
  ciudad: z.string().max(60).nullable().describe('Dónde vive y entrena; null si no lo ha dicho'),
  objetivo: z.object({
    carrera: z.string().min(1).max(80).describe('Nombre de la carrera objetivo, p. ej. "Maratón de Valencia"'),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD. Si solo sabe el mes, el último domingo de ese mes'),
    distanciaKm: z.number().positive().describe('42.195 maratón, 21.0975 media, 10, 5…'),
    tiempo: tiempo.nullable().describe('Tiempo objetivo "h:mm:ss" o "mm:ss"; null si solo quiere terminarla'),
  }),
  diasPorSemana: z.number().int().min(1).max(7).describe('Días que corre a la semana. 7 si corre todos los días'),
  notas: z
    .array(z.string().max(120))
    .max(6)
    .describe('Lesiones, restricciones o gustos que el coach deba tener en cuenta. Vacío si no hay nada'),
})

export type RunnerProfileInput = z.infer<typeof RunnerProfileInput>
