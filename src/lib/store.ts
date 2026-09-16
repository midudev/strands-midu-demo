// Lectura y escritura de los JSON de data/. Toda la persistencia "de andar por casa" pasa por aquí.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { trace } from './trace'

/** Lee un JSON. Si no existe o está roto, devuelve `fallback` (y deja traza si estaba roto). */
export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (err) {
    trace('store', `lectura rota ${path}`, { error: String((err as Error).message) }, 'warn')
    return fallback
  }
}

/** Escribe un JSON con indentación, creando la carpeta si hace falta. */
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))

  trace('store', `escrito ${path}`)
}
