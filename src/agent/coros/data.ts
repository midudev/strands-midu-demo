// Parsers del texto que devuelve el MCP de COROS → datos tipados para el dashboard y los guardrails.
// COROS responde en texto plano "humano"; aquí lo convertimos en objetos con expresiones regulares.
import { callCoros } from './client'
import { getFitData, type SeriesPoint } from './track'

export type { SeriesPoint }

// --- Tipos -----------------------------------------------------------------------------

export interface Run {
  /** labelId de COROS */
  id: string
  /** Código de deporte de COROS (100 = carrera exterior) */
  sportType: number
  /** YYYY-MM-DD */
  fecha: string
  nombre: string
  lugar: string | null
  km: number
  /** "h:mm:ss" o "mm:ss" */
  duracion: string
  /** min/km, "5:10" */
  ritmo: string
  fcMedia: number | null
  kcal: number | null
  start: { lat: number; lng: number } | null
}

export interface RunMetrics {
  tiempoTotal: string | null
  ritmoEnMovimiento: string | null
  ritmoAjustado: string | null
  mejorKm: string | null
  cadencia: number | null
  zancada: number | null
  potencia: number | null
  desnivelPos: number | null
  desnivelNeg: number | null
  kcal: number | null
  carga: number | null
  teAerobico: number | null
  teAnaerobico: number | null
  foco: string | null
  rendimiento: string | null
}

export interface RunLap {
  n: number
  km: number
  tiempo: string
  ritmo: string
  fcMedia: number | null
  fcMax: number | null
  cadencia: number | null
  potencia: number | null
  desnivel: number | null
  /** COROS la marca como una de las vueltas rápidas */
  rapida: boolean
}

export interface RunDetail extends Run {
  metrics: RunMetrics | null
  laps: RunLap[]
  /** [lat, lng] del recorrido, ya reducido a ~400 puntos */
  track: [number, number][]
  series: SeriesPoint[]
}

export interface Fitness {
  vo2max: number | null
  nivel: number | null
  /** Ritmo umbral, min/km */
  umbral: string | null
  prediccion: {
    '5K': string | null
    '10K': string | null
    media: string | null
    maraton: string | null
  }
}

export interface Recovery {
  porcentaje: number | null
  nivel: string | null
  horasParaRecuperar: number | null
}

export interface LoadDay {
  fecha: string
  comentario: string
  cortoPlazo: number
  largoPlazo: number
  ratio: number
}

/** Códigos de deporte de COROS que consideramos "correr": exterior, cinta, pista, trail. */
export const RUNNING_CODES = [100, 101, 102, 103]

// --- Helpers de parseo -----------------------------------------------------------------

/** Primer grupo de la regex como número, o null. */
function num(pattern: RegExp, text: string): number | null {
  const match = pattern.exec(text)

  return match ? Number(match[1]) : null
}

/** Primer grupo de la regex como string, o null. */
function str(pattern: RegExp, text: string): string | null {
  return pattern.exec(text)?.[1] ?? null
}

/** Valor de una línea "Etiqueta: valor". */
function lineValue(label: string, text: string): string | null {
  const pattern = new RegExp(`(?:^|\\n)\\s*${label}:\\s*(.+)`, 'im')

  return str(pattern, text)?.trim() ?? null
}

/** Tiempo de una línea de predicción ("5 km Prediction: 17:58"). Compara línea a línea para no confundir "Marathon" con "Half Marathon". */
function predictionTime(label: string, text: string): string | null {
  const pattern = new RegExp(`^\\s*${label}:\\s*([\\d:]+)`, 'i')

  for (const line of text.split('\n')) {
    const match = pattern.exec(line)
    if (match) return match[1]
  }

  return null
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Segundos por km → "m:ss". */
export function fmtPace(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '--'

  const minutes = Math.floor(secondsPerKm / 60)
  const seconds = Math.round(secondsPerKm % 60)

  return `${minutes}:${pad2(seconds)}`
}

/** "m:ss" → segundos por km. 0 si no se entiende. */
export function parsePace(pace: string): number {
  const [minutes, seconds] = pace.split(':').map(Number)

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0

  return minutes * 60 + seconds
}

/** Segundos → "h:mm:ss" o "mm:ss". */
export function fmtDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '--'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.round(totalSeconds % 60)

  return hours ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`
}

/** Serie km/tiempo/ritmo/FC construida a partir de las vueltas, cuando no hay fichero FIT. */
export function seriesFromLaps(laps: RunLap[]): SeriesPoint[] {
  const points: SeriesPoint[] = []
  let km = 0
  let seconds = 0

  for (const lap of laps) {
    const pace = parsePace(lap.ritmo)

    if (points.length === 0) {
      points.push({ km: 0, t: 0, pace, hr: lap.fcMedia })
    }

    km += lap.km
    seconds += Math.round(pace * lap.km)

    points.push({ km: Math.round(km * 1000) / 1000, t: seconds, pace, hr: lap.fcMedia })
  }

  return points
}

/** Date → "YYYYMMDD", el formato de fechas que piden las tools de COROS. */
export const yyyymmdd = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '')

const daysAgo = (days: number) => new Date(Date.now() - days * 86400_000)

// --- Parsers ---------------------------------------------------------------------------

/**
 * querySportRecords. Ejemplo de entrada:
 *   1. Outdoor Run — 2026-09-15
 *      Location: Barcelona Carrera
 *      Start Coordinates: 41.318001, 2.094000
 *      Duration: 56:57 | Distance: 11.01 km
 *      Average Pace: 5:10 /km | Avg HR: 123 bpm | Calories: 618 kcal
 *      LabelId: 480352098744041473 | SportType: 100
 */
export function parseRuns(text: string): Run[] {
  return text
    .split(/\n(?=\d+\. )/)
    .map((block): Run | null => {
      const header = /^\d+\. (.+?) — (\d{4}-\d{2}-\d{2})/.exec(block)
      const pace = str(/Average Pace: (\d+:\d{2})/, block)
      const id = str(/LabelId: (\d+)/, block)

      if (!header || !pace || !id) return null

      const coords = /Start Coordinates:\s*(-?[\d.]+),\s*(-?[\d.]+)/.exec(block)

      return {
        id,
        sportType: num(/SportType: (\d+)/, block) ?? 100,
        fecha: header[2],
        nombre: header[1],
        lugar: str(/Location: (.+)/, block)?.trim() ?? null,
        km: num(/Distance: ([\d.]+) km/, block) ?? 0,
        duracion: str(/Duration: ([\d:]+)/, block) ?? '',
        ritmo: pace,
        fcMedia: num(/Avg HR: (\d+)/, block),
        kcal: num(/Calories: (\d+)/, block),
        start: coords ? { lat: Number(coords[1]), lng: Number(coords[2]) } : null,
      }
    })
    .filter((run): run is Run => run !== null)
}

/** getActivityDetail: métricas de una sesión. */
export function parseActivityDetail(text: string): RunMetrics {
  const elevation = /Elevation Gain \/ Loss:\s*(\d+)\s*m\s*\/\s*(\d+)\s*m/i.exec(text)

  return {
    tiempoTotal: str(/Total Time:\s*([\d:]+)/i, text),
    ritmoEnMovimiento: str(/Moving Average Pace:\s*(\d+:\d{2})/i, text),
    ritmoAjustado: str(/Adjusted Pace:\s*(\d+:\d{2})/i, text),
    mejorKm: str(/Best Kilometer:\s*(\d+:\d{2})/i, text),
    cadencia: num(/Average Cadence:\s*(\d+)/i, text),
    zancada: num(/Average Stride Length:\s*([\d.]+)/i, text),
    potencia: num(/Average Power:\s*(\d+)/i, text),
    desnivelPos: elevation ? Number(elevation[1]) : num(/Elevation Gain:\s*(\d+)/i, text),
    desnivelNeg: elevation ? Number(elevation[2]) : null,
    kcal: num(/Calories:\s*(\d+)/i, text),
    carga: num(/Training Load:\s*(\d+)/i, text),
    teAerobico: num(/Aerobic TE:\s*([\d.]+)/i, text),
    teAnaerobico: num(/Anaerobic TE:\s*([\d.]+)/i, text),
    foco: lineValue('Training Focus', text),
    rendimiento: lineValue('Performance', text),
  }
}

interface CorosLap {
  lapIndex: number
  /** En centímetros */
  distance?: number
  time: number
  avgPace: number
  avgHr?: number
  maxHr?: number
  avgCadence?: number
  avgPower?: number
  elevGain?: number
}

interface CorosLapGroup {
  /** 2 = vueltas automáticas por km */
  type: number
  fastLapIndexList?: number[]
  laps?: CorosLap[]
}

/** Vueltas más cortas que esto (en cm) son restos de la última parcial y no se enseñan. */
const MIN_LAP_CM = 5_000

/** queryActivityLapData: viene como JSON. Preferimos el grupo de vueltas por km (type 2). */
export function parseLaps(text: string): RunLap[] {
  try {
    const data = JSON.parse(text) as { lapGroups?: CorosLapGroup[] }
    const group = data.lapGroups?.find((candidate) => candidate.type === 2) ?? data.lapGroups?.[0]

    if (!group?.laps?.length) return []

    const fastLaps = new Set(group.fastLapIndexList ?? [])

    return group.laps
      .filter((lap) => (lap.distance ?? 0) >= MIN_LAP_CM)
      .map((lap) => ({
        n: lap.lapIndex,
        km: (lap.distance ?? 0) / 100_000,
        tiempo: fmtDuration(lap.time),
        ritmo: fmtPace(lap.avgPace),
        fcMedia: lap.avgHr || null,
        fcMax: lap.maxHr || null,
        cadencia: lap.avgCadence || null,
        potencia: lap.avgPower || null,
        desnivel: lap.elevGain || null,
        rapida: fastLaps.has(lap.lapIndex),
      }))
  } catch {
    return []
  }
}

/**
 * queryFitnessAssessmentOverview. Ejemplo:
 *   VO2max: 58
 *   Running Level: 94
 *   Threshold Pace: 3:46 /km
 *   5 km Prediction: 17:58
 *   Half Marathon Prediction: 1:21:00
 *   Marathon Prediction: 2:52:00
 */
export function parseFitness(text: string): Fitness {
  return {
    vo2max: num(/VO2max:\s*([\d.]+)/i, text),
    nivel: num(/Running Level:\s*(\d+)/i, text),
    umbral: str(/Threshold Pace:\s*(\d+:\d{2})/i, text),
    prediccion: {
      '5K': predictionTime('5 km Prediction', text),
      '10K': predictionTime('10 km Prediction', text),
      media: predictionTime('Half Marathon Prediction', text),
      maraton: predictionTime('Marathon Prediction', text) ?? predictionTime('Full Marathon Prediction', text),
    },
  }
}

/** queryRecoveryStatus. Ejemplo: "Recovery: 100%\nLevel: Heavy training allowed\nEstimated Full Recovery: 0h" */
export function parseRecovery(text: string): Recovery {
  return {
    porcentaje: num(/Recovery(?: Score)?:\s*(\d+)%/i, text),
    nivel: lineValue('Level', text),
    horasParaRecuperar: num(/Estimated Full Recovery:\s*(\d+)\s*h/i, text),
  }
}

/** queryTrainingLoadAssessment. Un bloque por día: "2026-09-16\nComment: Maintaining\nShort-Term Load: 70\nLong-Term Load: 77\nLoad Ratio: 0.90" */
export function parseLoad(text: string): LoadDay[] {
  return text
    .split(/\n(?=\d{4}-\d{2}-\d{2})/)
    .map((block): LoadDay | null => {
      const fecha = /^(\d{4}-\d{2}-\d{2})/.exec(block.trim())?.[1]
      if (!fecha) return null

      return {
        fecha,
        comentario: lineValue('Comment', block) ?? '',
        cortoPlazo: num(/Short-Term Load:\s*(\d+)/i, block) ?? 0,
        largoPlazo: num(/Long-Term Load:\s*(\d+)/i, block) ?? 0,
        ratio: num(/Load Ratio:\s*([\d.]+)/i, block) ?? 0,
      }
    })
    .filter((day): day is LoadDay => day !== null)
}

// --- Consultas (sin LLM) ---------------------------------------------------------------

export interface Dashboard {
  fitness: Fitness | null
  recovery: Recovery | null
  load: LoadDay[]
  runs: Run[]
  /** Mensajes de las llamadas que fallaron; la portada los enseña sin romperse */
  errores: string[]
}

const settledText = (result: PromiseSettledResult<string>) => (result.status === 'fulfilled' ? result.value : null)

/** Todo lo que pinta la portada, en paralelo y sin pasar por el LLM. */
export async function getDashboard(days = 7): Promise<Dashboard> {
  const [fitness, recovery, load, runs] = await Promise.allSettled([
    callCoros('queryFitnessAssessmentOverview'),
    callCoros('queryRecoveryStatus'),
    callCoros('queryTrainingLoadAssessment', { days }),
    callCoros('querySportRecords', {
      startDate: yyyymmdd(daysAgo(days)),
      endDate: yyyymmdd(new Date()),
      sportTypeCodes: RUNNING_CODES,
      limit: 30,
    }),
  ])

  const errores = [fitness, recovery, load, runs]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => String(result.reason?.message ?? result.reason))

  const fitnessText = settledText(fitness)
  const recoveryText = settledText(recovery)
  const loadText = settledText(load)
  const runsText = settledText(runs)

  return {
    fitness: fitnessText ? parseFitness(fitnessText) : null,
    recovery: recoveryText ? parseRecovery(recoveryText) : null,
    load: loadText ? parseLoad(loadText) : [],
    runs: runsText ? parseRuns(runsText) : [],
    errores,
  }
}

/** Sesiones de running de los últimos `days` días. */
export async function getRuns(days = 14): Promise<Run[]> {
  const text = await callCoros('querySportRecords', {
    startDate: yyyymmdd(daysAgo(days)),
    endDate: yyyymmdd(new Date()),
    sportTypeCodes: RUNNING_CODES,
    limit: 40,
  })

  return parseRuns(text)
}

/** Una sesión con métricas, vueltas y recorrido. null si no está entre las de las últimas 3 semanas. */
export async function getRunDetail(id: string): Promise<RunDetail | null> {
  const run = (await getRuns(21)).find((candidate) => candidate.id === id)
  if (!run) return null

  const args = { labelId: id, sportType: run.sportType }

  const [detail, laps, fit] = await Promise.allSettled([
    callCoros('getActivityDetail', args),
    callCoros('queryActivityLapData', args),
    getFitData(id, run.sportType),
  ])

  const detailText = settledText(detail)
  const lapsText = settledText(laps)
  const fitData = fit.status === 'fulfilled' ? fit.value : { track: [], series: [] }

  return {
    ...run,
    metrics: detailText ? parseActivityDetail(detailText) : null,
    laps: lapsText ? parseLaps(lapsText) : [],
    track: fitData.track,
    series: fitData.series,
  }
}
