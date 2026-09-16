// Memoria a largo plazo: hechos que sobreviven entre sesiones.
// El MemoryManager hace tres cosas:
//   1. Antes de cada turno de usuario inyecta los recuerdos más relevantes en el contexto.
//   2. Expone dos tools al agente: recordar y buscar_en_memoria.
//   3. Tras cada invocación extrae hechos nuevos con el modelo, en segundo plano, y los guarda en markdown.
import { MemoryManager } from '@strands-agents/sdk'
import { FileMemoryStore } from '@strands-agents/sdk/vended-memory-stores/file-memory-store'

import { MEMORY_STORE } from '../lib/memory-files'

import { model } from './model'
import { EXTRACTION_PROMPT, MEMORY_STORE_DESCRIPTION } from './prompts/memory'
import { storage } from './session'

/** Cuántos recuerdos se inyectan como máximo en cada turno. */
const MAX_INJECTED_MEMORIES = 3

export function createMemory(): MemoryManager {
  const store = new FileMemoryStore({
    name: MEMORY_STORE,
    description: MEMORY_STORE_DESCRIPTION,
    storage,
    extraction: { model, systemPrompt: EXTRACTION_PROMPT },
  })

  return new MemoryManager({
    stores: [store],
    addToolConfig: {
      name: 'recordar',
      description: 'Guarda en la memoria a largo plazo un hecho sobre midu que merezca recordarse en futuras conversaciones.',
    },
    searchToolConfig: { name: 'buscar_en_memoria' },
    injection: { trigger: 'userTurn', maxEntries: MAX_INJECTED_MEMORIES },
  })
}
