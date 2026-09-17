# midu.run coach 🏃

<img width="3006" height="1704" alt="CleanShot 2026-09-17 at 09 30 03@2x" src="https://github.com/user-attachments/assets/0bfbb11a-c3a8-4bd6-ae97-115142f767e1" />
<img width="2988" height="1696" alt="CleanShot 2026-09-17 at 09 30 14@2x" src="https://github.com/user-attachments/assets/6d154660-b339-47cd-8a5b-d72a05c3826c" />


Coach personal de running hecho con [Strands Agents](https://strandsagents.com/) (TypeScript) y Astro. Lee los entrenamientos, la forma y la recuperación de midu desde el **MCP oficial de COROS**, scrapea las próximas carreras de **xipgroc.cat** y predice cómo las haría. Todo en una web minimalista (Geist + Geist Pixel, modo oscuro).

Es el proyecto de un taller: sirve para explicar Strands paso a paso. Está modularizado para eso: `src/agent/*.ts` contiene solo Strands; el resto es fontanería preparada.

## Arrancar

```bash
pnpm install
cp .env.example .env     # OPENAI_API_KEY
pnpm dev                 # http://localhost:4321
```

1. Pulsa **Conectar COROS**: login OAuth integrado en la web (PKCE + registro dinámico de cliente). Los tokens se guardan en `.coros/auth.json` y el SDK los refresca solo.
2. La portada carga tus datos de COROS (sin LLM), el coach genera el briefing del día y puedes predecir cualquier carrera o chatear con él.

Modelo: OpenAI **GPT 5.6 Luna** (`OPENAI_MODEL`, por defecto `gpt-5.6-luna`) a través de `OpenAIModel` de Strands.

## Qué hace la web

| Bloque | Cómo funciona |
|---|---|
| Stats (VO2max, umbral, predicción maratón vs objetivo 2:55, recuperación, carga, km) | Llamadas directas al `McpClient` de COROS y parseo del texto (`src/agent/coros/data.ts`) |
| Briefing del día | `Agent.invoke` con `structuredOutputSchema` (`Briefing`), cacheado por día en `data/briefing.json` |
| Últimos 7 días | `querySportRecords` parseado |
| Próximas carreras | Scraping de xipgroc.cat con cheerio, caché 6 h en `data/races.json` |
| Predecir carrera | Un **Swarm** de 4 agentes (analista → optimista → conservador → árbitro) se pasan el testigo; el árbitro guarda con `save_race_prediction`. La web pinta cada paso en vivo. |
| Chat | `Agent.stream` → NDJSON; el cliente pinta el texto, las tools y a los **especialistas** (fisio, entrenador, nutricionista) con sus propias tools y texto |
| Cerebro del coach | Estado del agente (`appState`: preferencias, turnos), sesión en disco y memoria a largo plazo (ficheros markdown) |

## Conceptos de Strands, dónde están

Regla del proyecto: **`src/agent/*.ts` es Strands** (lo que se escribe en el taller). Todo lo demás es fontanería ya hecha:
`src/agent/prompts/` (textos), `src/agent/coros/` (OAuth y parsers de COROS), `src/lib/` (cachés, reglas, traductores de eventos, NDJSON).

| Concepto | Fichero Strands | Fontanería que usa |
|---|---|---|
| `new Agent()` + system prompt + `OpenAIModel` | `src/agent/coach.ts`, `src/agent/model.ts` | `prompts/coach.ts` |
| `McpClient` pasado directamente en `tools` (filtrado con `toolFilters`) | `src/agent/coros/client.ts` | `coros/auth.ts` |
| `tool()` con Zod | `src/agent/tools/{races,predictions,state}.ts` | `lib/races.ts`, `lib/predictions.ts` |
| `structuredOutputSchema` | `src/agent/briefing.ts` | `schema.ts`, `lib/briefing.ts` |
| Hooks `BeforeInvocationEvent` / `BeforeToolCallEvent` / `AfterToolCallEvent` | `src/agent/guardrails.ts` | reglas en `lib/running.ts` |
| `agent.stream()` y eventos de streaming | `streamChat` en `src/agent/chat.ts` | `lib/chat-events.ts`, `lib/stream.ts`, `lib/api.ts` |
| `invocationState` compartido entre hooks y tools | `guardrails.ts` + `tools/predictions.ts` | |
| **Multi-agente: agent as tool** (`agent.asTool()`) | `src/agent/team.ts` | `prompts/team.ts`, `lib/team-store.ts` |
| **Multi-agente: Swarm** (handoff por structured output) | `src/agent/swarm.ts` | `prompts/swarm.ts`, `lib/swarm-events.ts` |
| **Session + Storage** (`SessionManager` + `LocalFileStorage`) | `src/agent/session.ts` | snapshots en `data/strands/sessions/` |
| **Conversation manager** (`SlidingWindow` en portada, `Summarizing` en `/runs/:id`) | `getChatAgent` / `getRunChatAgent` en `src/agent/chat.ts` | `lib/chat-history.ts`; botón "contexto" del chat |
| **Agent State** (`agent.appState`, fuera del contexto del modelo) | `src/agent/tools/state.ts` + hook en `chat.ts` | |
| **Memory** (`MemoryManager` + `FileMemoryStore`, extracción automática) | `src/agent/memory.ts` | `prompts/memory.ts`, `lib/memory-files.ts` |

### Guardrails (`src/agent/guardrails.ts`, reglas en `src/lib/running.ts`)

1. **Corrige inputs**: si el agente pide entrenamientos sin códigos de deporte, el hook mete los de running y limita el número.
2. **Sin datos no hay predicción**: no se puede guardar una predicción sin haber consultado `queryFitnessAssessmentOverview` en esa invocación.
3. **No vendas humo**: la predicción no puede ser más rápida que la de COROS para esa distancia (interpolando con Riegel si no es estándar).
4. **Valencia es el objetivo**: nada de "competir" ≥10 km en las 3 semanas previas ni 2 posteriores al maratón.
5. **Observabilidad**: cada tool queda registrada en `invocationState.toolsUsadas` y la web lo muestra.

### Multi-agente

- **Equipo (agent as tool)**: el coach de la portada tiene como tools a tres agentes completos. Cada uno tiene su prompt y acceso a COROS. El SDK reenvía los eventos del subagente envueltos en `toolStreamUpdateEvent`, así que el chat muestra qué pregunta el coach, qué tools usa cada especialista y lo que escribe, en vivo.
- **Enjambre (Swarm)**: la predicción de carrera la deciden cuatro agentes. Cada uno devuelve `{ agentId?, message, context? }` y el orquestador pasa el testigo. El `invocationState` se comparte entre nodos: el `fitness` que consulta el analista es el que usa el guardrail cuando el árbitro guarda. El recorrido (pasos, tools, mensajes, contexto) se guarda con la predicción en `data/predictions.json`.

### Sesión, contexto, estado y memoria

- **Sesión**: `SessionManager` guarda un snapshot (mensajes, `appState`, `modelState`) tras cada invocación en `data/strands/sessions/<id>/…/snapshot_latest.json` y lo restaura al arrancar. Reinicia el servidor y el chat sigue.
- **Contexto**: la portada usa `SlidingWindowConversationManager` con ventana de 12 mensajes (pequeña a propósito: en el taller se ve caer mensajes). Los chats de sesión usan `SummarizingConversationManager`. El botón "contexto" del chat fuerza un `reduce()` para verlo sin esperar a llenar la ventana.
- **Estado**: `agent.appState` no viaja al modelo. Las tools `guardar_preferencia` / `ver_preferencias` lo leen y escriben; un hook cuenta turnos. Se persiste con la sesión.
- **Memoria**: `MemoryManager` con `FileMemoryStore`. Antes de cada turno inyecta recuerdos relevantes; el coach puede llamar a `recordar` / `buscar_en_memoria`; tras cada invocación un extractor (con el mismo modelo) saca hechos duraderos en segundo plano. Todo queda en markdown legible.

## Estructura

```text
src/agent/              STRANDS: lo que se escribe en el taller
  model.ts              OpenAIModel (gpt-5.6-luna)
  coach.ts              createCoach: Agent + tools (COROS por MCP, carreras, predicciones)
  briefing.ts           invoke con structuredOutputSchema
  guardrails.ts         hooks: corrige inputs, veta predicciones, registra tools
  chat.ts               stream + SlidingWindow/Summarizing + SessionManager + appState + MemoryManager
  team.ts               agent as tool: fisio y nutricionista; opinión diaria en streaming
  swarm.ts              Swarm de predicción: analista, optimista, conservador, árbitro
  session.ts            LocalFileStorage + SessionManager
  memory.ts             MemoryManager + FileMemoryStore
  schema.ts             RacePrediction, Briefing (Zod)
  tools/races.ts        get_upcoming_races
  tools/predictions.ts  save_race_prediction (lee invocationState)
  tools/state.ts        guardar_preferencia, ver_preferencias (appState)
  coros/client.ts       McpClient de COROS + llamadas directas
  coros/auth.ts         OAuthClientProvider persistido en .coros/auth.json
  coros/data.ts         parsers del texto de COROS → tipos
  prompts/              coach.ts, team.ts, swarm.ts, memory.ts (solo texto)
src/lib/                FONTANERÍA sin Strands
  running.ts            VALENCIA, tiempos, baseline de COROS (Riegel), reglas de una predicción
  predictions.ts        almacén data/predictions.json (+ recorrido del swarm)
  briefing.ts           caché data/briefing.json
  team-store.ts         caché de opiniones (data/team.json, data/team-runs.json)
  memory-files.ts       lectura de los markdown de memoria
  chat-history.ts       ventana, historial legible, mensajes caídos
  chat-events.ts        eventos de agent.stream() → chunks del chat (incluye especialistas anidados)
  swarm-events.ts       eventos de swarm.stream() → chunks + pasos del enjambre
  stream.ts             textDelta, isInternalTool
  api.ts                ndjson(), requireCoros(), apiError()
  races.ts              scraper de xipgroc.cat
  store.ts, trace.ts, env.ts, debug.ts
src/pages/api/          auth/coros/{login,callback,logout}, races, predict, briefing, chat, context, brain, team, debug
src/components/         Topbar, Hero, Stats, Briefing, Brain, Team, Runs, Races, Chat, RunMap, RunCharts
data/                   races.json, predictions.json, briefing.json, team*.json (generados)
data/strands/           sessions/ (snapshots) y memory/midu/*.md
```

## Tests e2e (sin gastar tokens)

```
pnpm test:e2e        # Playwright, Chromium, ~15 s
pnpm test:e2e:ui     # modo interactivo
```

Los tests (`e2e/tests/`) recorren toda la web: portada, briefing, equipo, cerebro, chat con tools y especialistas, enjambre de
predicción, detalle de sesión, `/debug`, la API y el ciclo de conexión con COROS. Nada de eso llama a OpenAI ni a COROS:

- `e2e/fakes/model.ts` es un `Model` de Strands falso que responde según el prompt y las tools (texto, tool calls,
  structured output, handoffs del swarm). `astro.config.mjs` lo enchufa en lugar de `src/agent/model.ts` cuando `E2E_FAKE_AI=1`.
- `e2e/fakes/coros-server.ts` es un servidor MCP falso con las tools de COROS y datos inventados.
- La app corre con `e2e/.sandbox/` como cwd: `data/` y `.coros/` reales no se tocan. `e2e/fakes/start-app.ts` siembra el
  sandbox (tokens falsos, caché de carreras, un recorrido) y lanza `astro dev` en el puerto 4399, aparte del dev server normal.
