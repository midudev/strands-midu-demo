// Scraping de xipgroc.cat: próximas carreras de running en Catalunya. Caché de 6 h en data/races.json. Sin Strands.
import * as cheerio from 'cheerio'

import { hoy } from './running'
import { readJson, writeJson } from './store'
import { trace } from './trace'

export interface Race {
  /** id de xipgroc (o el nombre si no lo tiene) */
  id: string
  nombre: string
  /** YYYY-MM-DD */
  fecha: string
  /** Etiquetas tal cual las muestra xipgroc: "10K", "Mitja Marató", "5 km"... */
  distancias: string[]
  url: string | null
  inscripcionesAbiertas: boolean
  /** Si puntúa para alguna liga */
  liga: boolean
  imagen: string | null
}

export const RACES_FILE = 'data/races.json'

const CACHE_TTL_MS = 6 * 60 * 60_000

/** Páginas de resultados que scrapeamos como máximo (cada una trae ~20 carreras). */
const MAX_PAGES = 3

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36'

/** xipgroc escribe las fechas en catalán: "20 setembre 2026" */
const MESES_CATALAN: Record<string, string> = {
  gener: '01',
  febrer: '02',
  març: '03',
  abril: '04',
  maig: '05',
  juny: '06',
  juliol: '07',
  agost: '08',
  setembre: '09',
  octubre: '10',
  novembre: '11',
  desembre: '12',
}

// --- Scraping --------------------------------------------------------------------------

/** URL del listado de carreras de running a partir de una fecha, paginado. */
export function xipgrocUrl(page = 1, from = new Date()): URL {
  const url = new URL('https://xipgroc.cat/ca/cursas')

  url.search = new URLSearchParams({
    'q[data_gteq]': from.toISOString().slice(0, 10),
    'q[data_lteq]': '',
    'q[run_type_cont_any][]': 'running',
    curses_view_type: 'big',
    result_preset: 'next',
    page: String(page),
  }).toString()

  return url
}

/** "20 setembre 2026" → "2026-09-20". null si no reconoce el formato. */
function parseDate(text: string): string | null {
  const match = /(\d{1,2})\s+([a-zç]+)\s+(\d{4})/i.exec(text.trim())
  if (!match) return null

  const [, day, monthName, year] = match
  const month = MESES_CATALAN[monthName.toLowerCase()]

  return month ? `${year}-${month}-${day.padStart(2, '0')}` : null
}

/** Convierte el HTML de una página de xipgroc en carreras. Descarta las que no tienen fecha o nombre. */
export function parseRacesHtml(html: string): Race[] {
  const $ = cheerio.load(html)

  return $('article.cursa')
    .map((_, element) => {
      const $race = $(element)

      const fecha = parseDate($race.find('.cursa-content > p').first().text())
      const nombre = $race.find('.title-link').text().trim()

      if (!fecha || !nombre) return null

      const distancias = $race
        .find('a.inscripcio')
        .map((_, link) => $(link).text().trim())
        .get()
        .filter(Boolean)

      return {
        id: ($race.attr('id') ?? '').replace('cursa_', '') || nombre,
        nombre,
        fecha,
        distancias,
        url: $race.find('.title-link').attr('href') ?? null,
        inscripcionesAbiertas: $race.find('a.inscripcio.main-link').length > 0,
        liga: $race.find('.leage-info').text().includes('Lliga'),
        imagen: $race.find('input[type=hidden]').attr('value') || null,
      } satisfies Race
    })
    .get()
    .filter((race): race is Race => race !== null)
}

/** Scrapea varias páginas, quita duplicados y ordena por fecha. */
export async function scrapeRaces(pages = MAX_PAGES): Promise<Race[]> {
  const all: Race[] = []

  for (let page = 1; page <= pages; page++) {
    const response = await fetch(xipgrocUrl(page), {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ca,es' },
    })

    if (!response.ok) throw new Error(`xipgroc ${response.status}`)

    const races = parseRacesHtml(await response.text())
    if (races.length === 0) break

    all.push(...races)
  }

  const uniqueById = new Map(all.map((race) => [race.id, race]))

  return [...uniqueById.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// --- Caché -----------------------------------------------------------------------------

interface RacesCache {
  fetchedAt: string
  races: Race[]
}

const isFresh = (cache: RacesCache) => Date.now() - Date.parse(cache.fetchedAt) < CACHE_TTL_MS

/**
 * Carreras desde la caché si es reciente; si no, scrapea y guarda.
 * Si el scraping falla pero hay caché (aunque sea vieja), la devuelve en vez de fallar.
 */
export async function getRaces({ refresh = false } = {}): Promise<RacesCache> {
  const cached = readJson<RacesCache | null>(RACES_FILE, null)

  if (!refresh && cached && isFresh(cached)) {
    trace('races', 'cache hit', { fetchedAt: cached.fetchedAt, count: cached.races.length })
    return cached
  }

  const startedAt = Date.now()

  try {
    const races = await scrapeRaces()
    const fresh: RacesCache = { fetchedAt: new Date().toISOString(), races }

    writeJson(RACES_FILE, fresh)
    trace('races', 'scrape ok', { count: races.length, refresh, ms: Date.now() - startedAt })

    return fresh
  } catch (err) {
    const error = String((err as Error).message)
    const ms = Date.now() - startedAt

    if (cached) {
      trace('races', 'scrape falló, uso cache', { error, ms }, 'warn')
      return cached
    }

    trace('races', 'scrape error', { error, ms }, 'error')
    throw err
  }
}

// --- Distancias -------------------------------------------------------------------------

/** Km a partir de la etiqueta de distancia: "10K", "5k", "Mitja Marató", "21,1 km"... null si no se entiende. */
export function distanceKm(label: string): number | null {
  const text = label.toLowerCase()

  const isMarathon = /marat[oó]/.test(text)
  const isHalf = /mitja|media|half/.test(text)

  if (isMarathon && isHalf) return 21.1
  if (isMarathon) return 42.2
  if (/milla/.test(text)) return 1.6

  const match = /(\d+(?:[.,]\d+)?)\s*k/.exec(text)

  return match ? Number(match[1].replace(',', '.')) : null
}

/** Distancias que interesan en la portada: 5K, 10K y media. */
const FEATURED_KM = [5, 10, 21.1] as const

/** Tolerancia al comparar distancias ("21K" vs 21.1) */
const KM_TOLERANCE = 0.35

const hasFeaturedDistance = (race: Race) =>
  race.distancias.some((label) => {
    const km = distanceKm(label)

    return km != null && FEATURED_KM.some((target) => Math.abs(km - target) < KM_TOLERANCE)
  })

/** Carreras futuras con 5K, 10K o media, ya ordenadas por fecha. */
export function featuredRaces(races: Race[], limit = 5): Race[] {
  const today = hoy()

  return races.filter((race) => race.fecha >= today && hasFeaturedDistance(race)).slice(0, limit)
}
