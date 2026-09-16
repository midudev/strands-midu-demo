// Ficheros FIT de COROS → recorrido (lat/lng) y serie temporal (km, tiempo, ritmo, FC). Caché en data/tracks/.
import { Decoder, Stream } from '@garmin/fitsdk'

import { readJson, writeJson } from '../../lib/store'

import { callCoros } from './client'

/** Los FIT guardan lat/lng en "semicircles": 2^31 semicírculos = 180 grados. */
const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31

/** Puntos máximos que devolvemos al navegador (track y serie). */
const MAX_POINTS = 400

/** Los timestamps FIT cuentan desde 1989-12-31; esto es su offset respecto a Unix. */
const FIT_EPOCH_OFFSET = 631_065_600

/** Por debajo de esta velocidad (m/s) consideramos que está parado y no calculamos ritmo. */
const MIN_MOVING_SPEED = 0.4

/** Ritmos por encima de 20 min/km son ruido de GPS. */
const MAX_PACE_SECONDS = 1200

export interface SeriesPoint {
  km: number
  /** Segundos desde el inicio */
  t: number
  /** Segundos por km; 0 si no se pudo calcular */
  pace: number
  hr: number | null
}

export interface FitData {
  track: [number, number][]
  series: SeriesPoint[]
}

interface FitRecord {
  timestamp?: Date | number
  positionLat?: number
  positionLong?: number
  /** Metros */
  distance?: number
  /** m/s */
  speed?: number
  enhancedSpeed?: number
  heartRate?: number
}

/** Se queda con `max` puntos repartidos uniformemente. */
function downsample<T>(points: T[], max = MAX_POINTS): T[] {
  if (points.length <= max) return points

  const step = (points.length - 1) / (max - 1)

  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)])
}

/** Normaliza el timestamp del FIT (Date, ms, s Unix o s desde la época FIT) a segundos Unix. */
function toUnixSeconds(timestamp: FitRecord['timestamp']): number | null {
  if (timestamp instanceof Date) {
    const ms = timestamp.getTime()

    return Number.isFinite(ms) ? ms / 1000 : null
  }

  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    if (timestamp > 1e12) return timestamp / 1000 // milisegundos Unix
    if (timestamp > 1e9) return timestamp // segundos Unix

    return timestamp + FIT_EPOCH_OFFSET // segundos desde la época FIT
  }

  return null
}

const isFitCache = (value: unknown): value is FitData =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Array.isArray((value as FitData).track) &&
  Array.isArray((value as FitData).series)

/** Decodifica un FIT y extrae recorrido y serie, ya reducidos a MAX_POINTS. */
export function parseFitFile(buffer: Buffer): FitData {
  const decoder = new Decoder(Stream.fromBuffer(buffer))
  const { messages } = decoder.read() as { messages: { recordMesgs?: FitRecord[] } }

  const track: [number, number][] = []
  const series: SeriesPoint[] = []

  let startedAt: number | null = null
  let previous: { t: number; km: number } | null = null

  for (const record of messages.recordMesgs ?? []) {
    if (record.positionLat != null && record.positionLong != null) {
      track.push([record.positionLat * SEMICIRCLES_TO_DEGREES, record.positionLong * SEMICIRCLES_TO_DEGREES])
    }

    const unixSeconds = toUnixSeconds(record.timestamp)
    if (startedAt == null && unixSeconds != null) startedAt = unixSeconds

    const t: number = unixSeconds != null && startedAt != null ? Math.max(0, unixSeconds - startedAt) : (previous?.t ?? 0)
    const km: number = record.distance != null && record.distance >= 0 ? record.distance / 1000 : (previous?.km ?? 0)

    // Ritmo: de la velocidad si la hay; si no, de la distancia y el tiempo desde el punto anterior
    const speed = record.enhancedSpeed ?? record.speed
    let pace = speed != null && speed > MIN_MOVING_SPEED ? 1000 / speed : 0

    if (!pace && previous && km > previous.km && t > previous.t) {
      pace = (t - previous.t) / (km - previous.km)
    }

    const hr = record.heartRate && record.heartRate > 0 ? record.heartRate : null

    // Punto sin información nueva (parado, sin FC y misma distancia): fuera
    if (!pace && hr == null && previous && km === previous.km) continue

    series.push({
      km: Math.round(km * 1000) / 1000,
      t: Math.round(t),
      pace: pace > 0 && pace < MAX_PACE_SECONDS ? Math.round(pace) : 0,
      hr,
    })

    previous = { t, km }
  }

  return { track: downsample(track), series: downsample(series) }
}

export function parseFitTrack(buffer: Buffer): [number, number][] {
  return parseFitFile(buffer).track
}

/** Descarga (o lee de caché) el FIT de una sesión y lo parsea. Si COROS no da URL, devuelve vacío. */
export async function getFitData(labelId: string, sportType: number): Promise<FitData> {
  const cachePath = `data/tracks/${labelId}.json`
  const cached = readJson<unknown>(cachePath, null)

  if (isFitCache(cached) && (cached.track.length || cached.series.length)) return cached

  const text = await callCoros('queryActivityFitFileDownloadUrls', { labelId, sportType })
  const url = /https:\/\/\S+\.fit/.exec(text)?.[0]

  if (!url) {
    // Formato antiguo de caché: solo el track como array
    const legacyTrack = Array.isArray(cached) ? (cached as [number, number][]) : []

    return { track: legacyTrack, series: [] }
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`FIT ${response.status}`)

  const data = parseFitFile(Buffer.from(await response.arrayBuffer()))

  if (data.track.length || data.series.length) writeJson(cachePath, data)

  return data
}

export async function getTrack(labelId: string, sportType: number): Promise<[number, number][]> {
  return (await getFitData(labelId, sportType)).track
}
