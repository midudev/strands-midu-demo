// Solo reúne el estado de los ejercicios para la web. Los desbloqueos están
// junto al código de Strands en cada fichero de src/agent/.
import { BRIEFING_ENABLED } from './briefing'
import { CHAT_ENABLED } from './chat'
import { GUARDRAILS_ENABLED, MCP_ENABLED, OWN_TOOL_ENABLED } from './coach'
import { MEMORY_ENABLED } from './memory'
import { SESSION_ENABLED } from './session'
import { SWARM_ENABLED } from './swarm'
import { TEAM_ENABLED } from './team'

export const workshop = {
  chat: CHAT_ENABLED,
  mcp: MCP_ENABLED,
  ownTool: OWN_TOOL_ENABLED,
  briefing: BRIEFING_ENABLED,
  guardrails: GUARDRAILS_ENABLED,
  team: TEAM_ENABLED,
  swarm: SWARM_ENABLED,
  session: SESSION_ENABLED,
  memory: MEMORY_ENABLED,
} as const
