// El sandbox: una carpeta vacía que hace de cwd de la app durante los tests, para que data/ y .coros/
// de verdad no se toquen. Aquí se siembra lo mínimo para que la web arranque "conectada" y sin red.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const SANDBOX = resolve(PROJECT_ROOT, 'e2e/.sandbox')

export const APP_PORT = 4399
export const APP_URL = `http://127.0.0.1:${APP_PORT}`

const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
const addDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

/** Sesiones de running de los últimos días. El primer id tiene recorrido cacheado en el sandbox (data/tracks). */
export const RUNS = [
  { id: '900000000000000001', fecha: day(1), nombre: 'Outdoor Run', lugar: 'Barcelona', km: 11.01, duracion: '56:57', ritmo: '5:10', fc: 123, kcal: 618 },
  { id: '900000000000000002', fecha: day(2), nombre: 'Outdoor Run', lugar: 'Barcelona', km: 8.2, duracion: '41:00', ritmo: '5:00', fc: 130, kcal: 460 },
  { id: '900000000000000003', fecha: day(4), nombre: 'Outdoor Run', lugar: 'Castelldefels', km: 12.3, duracion: '52:16', ritmo: '4:15', fc: 152, kcal: 700 },
]

/** Carreras "scrapeadas": dos con distancia destacada (5K/10K/media) y una de trail que no sale en la portada. */
export const RACES = [
  { id: 'e2e-10k', nombre: 'Cursa 10K de Prova', fecha: addDays(20), distancias: ['10K', '5K'], url: 'https://xipgroc.cat/e2e-10k', inscripcionesAbiertas: true, liga: true, imagen: null },
  { id: 'e2e-mitja', nombre: 'Mitja Marató de Prova', fecha: addDays(45), distancias: ['Mitja Marató'], url: null, inscripcionesAbiertas: false, liga: false, imagen: null },
  { id: 'e2e-trail', nombre: 'Trail de Prova', fecha: addDays(30), distancias: ['25 km'], url: null, inscripcionesAbiertas: true, liga: false, imagen: null },
]

/** Sesión con recorrido cacheado (data/tracks): un cuadrado por el Eixample y una serie de 20 puntos. */
export const TRACKED_RUN_ID = '900000000000000001'

function fakeTrack() {
  const track: [number, number][] = []
  const series: { km: number; t: number; pace: number; hr: number | null }[] = []
  for (let i = 0; i < 20; i++) {
    const t = i / 19
    track.push([41.39 + 0.01 * Math.sin(t * Math.PI * 2), 2.17 + 0.01 * Math.cos(t * Math.PI * 2)])
    series.push({ km: Math.round(11.01 * t * 1000) / 1000, t: Math.round(3417 * t), pace: 300 + Math.round(10 * Math.sin(i)), hr: 115 + i })
  }
  return { track, series }
}

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
}

/** Tokens falsos: isCorosConnected() solo mira que existan; el servidor MCP falso no los comprueba. */
export function seedAuth() {
  writeJson(`${SANDBOX}/.coros/auth.json`, {
    redirectUrl: `${APP_URL}/api/auth/coros/callback`,
    clientInformation: { client_id: 'e2e-fake-client' },
    tokens: { access_token: 'e2e-fake-token', token_type: 'bearer' },
  })
}

/** Perfil del corredor ya creado: la portada arranca en modo coach sin pasar por la bienvenida. */
export const RUNNER = {
  nombre: 'midu',
  ciudad: 'Barcelona',
  objetivo: { carrera: 'Maratón de Valencia', fecha: '2026-12-06', distanciaKm: 42.195, tiempo: '2:55:00' },
  diasPorSemana: 7,
  notas: [],
  creado: '2026-09-01T08:00:00.000Z',
}

export function seedRunner() {
  writeJson(`${SANDBOX}/data/runner.json`, RUNNER)
}

/** Caché de carreras fresca: así la app no intenta scrapear xipgroc.cat. */
export function seedRaces() {
  writeJson(`${SANDBOX}/data/races.json`, { fetchedAt: new Date().toISOString(), races: RACES })
}

export function seedSandbox() {
  rmSync(SANDBOX, { recursive: true, force: true })
  mkdirSync(SANDBOX, { recursive: true })
  seedAuth()
  seedRunner()
  seedRaces()
  writeJson(`${SANDBOX}/data/tracks/${TRACKED_RUN_ID}.json`, fakeTrack())
}
