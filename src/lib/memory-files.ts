// Lectura de los ficheros markdown que escribe el FileMemoryStore de Strands, para pintarlos en la web.
// Sin Strands: solo lee disco.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'

/** Raíz de todo lo que Strands persiste (sesiones y memoria). */
export const STRANDS_DIR = 'data/strands'

/** Nombre del store de memoria: una única persona, el corredor del perfil (data/runner.json). */
export const MEMORY_STORE = 'runner'

export const MEMORY_DIR = `${STRANDS_DIR}/memory/${MEMORY_STORE}`

export interface MemoryEntryView {
  file: string
  /** Primera línea del markdown, sin el "#" */
  titulo: string
  /** Resto de líneas, sin los guiones de lista */
  hechos: string[]
  /** ISO de la última modificación del fichero */
  actualizado: string
}

/** Parsea un fichero de memoria: título en la primera línea, un hecho por línea después. */
function readEntry(file: string): MemoryEntryView {
  const path = `${MEMORY_DIR}/${file}`

  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const titulo = (lines[0] ?? file).replace(/^#+\s*/, '')
  const hechos = lines.slice(1).map((line) => line.replace(/^[-*]\s*/, ''))

  return {
    file,
    titulo,
    hechos,
    actualizado: statSync(path).mtime.toISOString(),
  }
}

/** Todas las entradas de memoria, las más recientes primero. */
export function listMemory(): MemoryEntryView[] {
  if (!existsSync(MEMORY_DIR)) return []

  return readdirSync(MEMORY_DIR)
    .filter((file) => file.endsWith('.md'))
    .map(readEntry)
    .sort((a, b) => b.actualizado.localeCompare(a.actualizado))
}

export function memoryStats() {
  const entries = listMemory()
  const hechos = entries.reduce((total, entry) => total + entry.hechos.length, 0)

  return { entradas: entries.length, hechos }
}
