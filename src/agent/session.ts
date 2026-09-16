// Session + Storage: dónde se persiste un agente.
// Un único backend en fichero (data/strands/) con un namespace por subsistema: sessions/ y memory/.
import { SessionManager } from '@strands-agents/sdk'
import { LocalFileStorage } from '@strands-agents/sdk/storage'

import { STRANDS_DIR } from '../lib/memory-files'

export const storage = new LocalFileStorage(STRANDS_DIR)

/**
 * Guarda un snapshot del agente (mensajes, appState, modelState) tras cada invocación
 * y lo restaura en agent.initialize(). Reinicia el servidor y el chat sigue donde estaba.
 *
 * Ruta: data/strands/sessions/<sessionId>/scopes/agent/<agentId>/snapshots/snapshot_latest.json
 */
export function createSession(sessionId: string): SessionManager {
  return new SessionManager({
    sessionId,
    storage: storage.namespace('sessions'),
    saveLatestOn: 'invocation',
  })
}
