// Servidor MCP falso que imita al de COROS (streamable HTTP, sin estado). Los tests apuntan COROS_MCP_URL aquí.
// Devuelve textos con el mismo formato que parsea src/agent/coros/data.ts, con fechas relativas a hoy.
import { createServer, type IncomingMessage } from 'node:http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { RUNS } from './sandbox'

export const COROS_PORT = 4398
export const COROS_URL = `http://127.0.0.1:${COROS_PORT}/mcp`

const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)

export const FITNESS_TEXT = [
  'VO2max: 58',
  'Running Level: 94',
  'Threshold Pace: 3:46 /km',
  '5 km Prediction: 17:58',
  '10 km Prediction: 37:30',
  'Half Marathon Prediction: 1:21:00',
  'Marathon Prediction: 2:52:00',
].join('\n')

const sportRecordsText = () =>
  RUNS.map(
    (run, i) =>
      `${i + 1}. ${run.nombre} — ${run.fecha}\n` +
      `   Location: ${run.lugar}\n` +
      `   Start Coordinates: 41.390000, 2.170000\n` +
      `   Duration: ${run.duracion} | Distance: ${run.km} km\n` +
      `   Average Pace: ${run.ritmo} /km | Avg HR: ${run.fc} bpm | Calories: ${run.kcal} kcal\n` +
      `   LabelId: ${run.id} | SportType: 100`,
  ).join('\n')

const activityDetailText = () =>
  [
    'Total Time: 57:10',
    'Moving Average Pace: 5:08 /km',
    'Adjusted Pace: 5:05 /km',
    'Best Kilometer: 4:41',
    'Average Cadence: 172 spm',
    'Average Stride Length: 1.12 m',
    'Average Power: 280 W',
    'Elevation Gain / Loss: 64 m / 61 m',
    'Calories: 618 kcal',
    'Training Load: 88',
    'Aerobic TE: 3.1',
    'Anaerobic TE: 0.4',
    'Training Focus: Base',
    'Performance: Above Average',
  ].join('\n')

const lapsJson = () =>
  JSON.stringify({
    lapGroups: [
      {
        type: 2,
        fastLapIndexList: [3],
        laps: Array.from({ length: 11 }, (_, i) => ({
          lapIndex: i + 1,
          distance: i === 10 ? 1000 : 100_000, // último parcial residual (10 m): se descarta
          time: 310 - i * 2,
          avgPace: 310 - i * 2,
          avgHr: 118 + i,
          maxHr: 130 + i,
          avgCadence: 170,
          avgPower: 275,
          elevGain: 5,
        })),
      },
    ],
  })

const loadText = () =>
  Array.from({ length: 7 }, (_, i) =>
    [`${day(i)}`, 'Comment: Maintaining', `Short-Term Load: ${70 + i}`, `Long-Term Load: 77`, `Load Ratio: 0.90`].join('\n'),
  ).join('\n')

const RECOVERY_TEXT = 'Recovery: 100%\nLevel: Heavy training allowed\nEstimated Full Recovery: 0h'

function buildMcp() {
  const mcp = new McpServer({ name: 'coros-fake', version: '0.0.1' })
  const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] })

  mcp.registerTool(
    'querySportRecords',
    {
      description: 'Sport records (fake)',
      inputSchema: {
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        sportTypeCodes: z.array(z.number()).optional(),
        limit: z.number().optional(),
      },
    },
    async () => text(sportRecordsText()),
  )
  mcp.registerTool(
    'getActivityDetail',
    { description: 'Activity detail (fake)', inputSchema: { labelId: z.string(), sportType: z.number().optional() } },
    async () => text(activityDetailText()),
  )
  mcp.registerTool(
    'queryActivityLapData',
    { description: 'Lap data (fake)', inputSchema: { labelId: z.string(), sportType: z.number().optional() } },
    async () => text(lapsJson()),
  )
  mcp.registerTool('queryFitnessAssessmentOverview', { description: 'Fitness (fake)', inputSchema: {} }, async () => text(FITNESS_TEXT))
  mcp.registerTool(
    'queryTrainingLoadAssessment',
    { description: 'Training load (fake)', inputSchema: { days: z.number().optional() } },
    async () => text(loadText()),
  )
  mcp.registerTool('queryRecoveryStatus', { description: 'Recovery (fake)', inputSchema: {} }, async () => text(RECOVERY_TEXT))
  mcp.registerTool(
    'querySleepData',
    { description: 'Sleep (fake)', inputSchema: { startDate: z.string().optional(), endDate: z.string().optional() } },
    async () => text(`${day(1)}\nSleep Duration: 7h 40m\nSleep Score: 84`),
  )
  mcp.registerTool(
    'queryActivityFitFileDownloadUrls',
    { description: 'FIT urls (fake)', inputSchema: { labelId: z.string(), sportType: z.number().optional() } },
    // Sin URL: la web se queda sin recorrido para las sesiones que no estén cacheadas
    async () => text('No FIT file available'),
  )

  return mcp
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : undefined)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

export function startCorosServer(port = COROS_PORT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (url.pathname === '/health') {
      res.writeHead(200).end('ok')
      return
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404).end()
      return
    }

    if (req.method !== 'POST') {
      // Sin sesión no hay stream GET ni DELETE: 405 es lo que hace el servidor de referencia sin estado
      res.writeHead(405).end()
      return
    }

    try {
      const body = await readBody(req)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      const mcp = buildMcp()
      res.on('close', () => {
        void transport.close()
        void mcp.close()
      })
      await mcp.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (err) {
      console.error('[coros-fake]', err)
      if (!res.headersSent) res.writeHead(500).end(String((err as Error).message))
    }
  })

  return new Promise<typeof server>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[coros-fake] MCP escuchando en ${COROS_URL}`)
      resolve(server)
    })
  })
}

// Ejecutado directamente (webServer de Playwright): arranca y espera
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  void startCorosServer()
}
