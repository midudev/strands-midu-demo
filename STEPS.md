# Taller Strands + midu.run · 30 minutos

## Preparación (antes de contar el tiempo)

```bash
pnpm install
cp .env.example .env # configura OPENAI_API_KEY
pnpm exec astro dev --background
pnpm exec astro dev status
```

Abre <http://localhost:4321>, conecta COROS y completa la bienvenida. La bienvenida, las estadísticas y los entrenamientos ya funcionan para que el taller empiece con una página útil. Las llamadas al modelo pueden tener coste.

**Cómo avanzar:** sigue los steps en orden. Cada uno indica **qué fichero abrir**, **qué línea descomentar**, **qué acaba de ocurrir** y **qué probar**. Si una línea ya aparece sin `//`, ese step ya está activo. Guarda y recarga la página tras cada cambio. Todos los módulos se ven desde el principio; sus controles y llamadas se activan conforme implementas la parte de Strands correspondiente. Durante el taller solo editas `src/agent/`.

Si un cambio no aparece tras recargar, reinicia el servidor:

```bash
pnpm exec astro dev stop
pnpm exec astro dev --background
```

### Punto de partida · minutos 0–2

Muestra el panel COROS, entra en un entrenamiento y señala chat, briefing, equipo, cerebro y predicción de carreras. Antes de activar sus steps, están visibles y desactivados. El panel obtiene las métricas directamente del MCP de COROS; aún no se las hemos dado al agente.

## STEP 1 · Crear el Agent del chat (minutos 2–5)

### 1. Ve a este fichero

[`src/agent/chat.ts`](src/agent/chat.ts), justo antes de `getChatAgent()`.

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
makeChatAgent = (config) => new Agent(config)
```

### 3. Entiende la creación

Esta línea crea una pequeña factoría que ejecuta `new Agent(config)` cuando se abre un chat. `getChatAgent()` prepara ese `config` para el coach de portada y `getRunChatAgent()` prepara otro para cada entrenamiento. La web detecta que la factoría está activa y habilita el chat.

### 4. Recorre la configuración

En el mismo fichero, baja a `const agent = makeChatAgent!({ ... })` dentro de `getChatAgent()`. Lee sus propiedades de arriba abajo:

1. `id` y `name` identifican al coach. El chat de una sesión usa otro `id` para no mezclar conversaciones.
2. `model` es el modelo de Strands; `systemPrompt` explica al modelo quién es el corredor y qué capacidades tiene ya activas.
3. `tools` empieza sin herramientas del coach. El step 2 añade COROS; el 3, carreras; el 5, el guardado de predicciones; el 6, especialistas; y el 8, preferencias. Esos steps activan líneas en otros ficheros: aquí no tienes que editar el array.
4. `conversationManager` conserva una ventana corta mientras el servidor está en marcha. En el step 8 el chat de sesión usará además un resumen.
5. `sessionManager` vale `undefined` hasta el step 8; entonces guardará y restaurará la conversación en disco.
6. `memoryManager` vale `undefined` hasta el step 9; entonces añadirá memoria a largo plazo.
7. `printer: false` evita duplicar en la consola el texto que muestra la web.

Después de construirlo, `agent.initialize()` lo deja listo. En `streamChat()` se usa `agent.stream(message)` y los eventos se traducen al formato que pinta la web. La bienvenida usa un agente preparado por separado para crear el perfil.

### 5. Comprueba el resultado

El chat se habilita. Pregunta por tu objetivo. El coach responde por fragmentos y, si le pides métricas recientes, te dirá que todavía no puede consultarlas.

## STEP 2 · Darle COROS como tools (minutos 5–8)

### 1. Ve a este fichero

[`src/agent/coach.ts`](src/agent/coach.ts), bloque `step 2`.

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
corosTools = () => isCorosConnected() ? [corosClient()] : []
```

### 3. Explica qué ocurre

`coachTools()` pasa este `McpClient` al array `tools` del Agent creado en el step 1. En [`src/agent/coros/client.ts`](src/agent/coros/client.ts), `toolFilters` decide cuáles de las tools de COROS ve el modelo. El dashboard ya consultaba COROS directamente; ahora puede hacerlo el coach durante una conversación.

### 4. Comprueba el resultado

Pregunta «¿Cómo fue mi último entrenamiento?». El chat muestra qué tool de COROS llamó y la respuesta basada en esos datos.

## STEP 3 · Añadir una tool propia con Zod (minutos 8–11)

### 1. Ve a este fichero

[`src/agent/coach.ts`](src/agent/coach.ts), bloque `step 3`.

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
ownRaceTool = getUpcomingRaces
```

### 3. Explica qué ocurre

`coachTools()` incorpora esta tool al mismo array `tools`. Abre [`src/agent/tools/races.ts`](src/agent/tools/races.ts) para enseñar `tool({ name, description, inputSchema, callback })`: Zod valida los argumentos que propone el modelo y el callback consulta las carreras.

### 4. Comprueba el resultado

Pregunta «¿Qué carreras hay cerca?». En el chat aparece `get_upcoming_races` antes de la respuesta.

## STEP 4 · Pedir una salida estructurada (minutos 11–14)

### 1. Ve a este fichero

[`src/agent/briefing.ts`](src/agent/briefing.ts), bloque `step 4`.

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
briefingInvoke = (coach, ask) => coach.invoke(ask, { structuredOutputSchema: Briefing })
```

### 3. Explica qué ocurre

Esta invocación usa un Agent para producir el objeto que necesita la tarjeta de briefing. [`src/agent/schema.ts`](src/agent/schema.ts) define con Zod el semáforo, la sesión por bloques y los siete días. `dailyBriefing()` guarda el resultado del día en caché.

### 4. Comprueba el resultado

Aparece el briefing. Pulsa «Regenerar» para forzar una invocación si había un resultado guardado.

## STEP 5 · Instalar hooks y guardrails (minutos 14–18)

### 1. Ve a este fichero

[`src/agent/coach.ts`](src/agent/coach.ts). Busca la línea comentada de `installGuardrails`.

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
installGuardrails = addGuardrails
```

### 3. Explica qué ocurre

Al asignarle `addGuardrails`, las llamadas que ya existen tras crear el Agent registran los hooks. Fíjate en `getChatAgent()` de [`src/agent/chat.ts`](src/agent/chat.ts) y en `createCoach()` de `coach.ts`. Además, `coachTools()` incorpora `save_race_prediction` al array `tools`: el modelo puede pedir guardarla y el hook puede comprobarla antes.

Ahora abre [`src/agent/guardrails.ts`](src/agent/guardrails.ts). `addGuardrails(agent)` registra **tres eventos del ciclo de Strands**, en este orden durante una pregunta:

1. **`BeforeInvocationEvent` — empieza la pregunta.** Prepara `invocationState.toolsUsadas`. `invocationState` es un objeto temporal compartido por los hooks y las tools de esta invocación. Conserva el mismo array si otro Agent del swarm ya lo había creado. No es la sesión persistente que añadiremos en el step 8.
2. **`BeforeToolCallEvent` — el modelo ha pedido una tool, pero aún no se ha ejecutado.** Si pide `querySportRecords` sin códigos de deporte, el hook añade los cuatro códigos de running. Si omite `limit` o pide más de 30, lo fija en 30. Puedes ver el cambio porque modifica `event.toolUse.input` y deja una traza `guardrail` en `/debug`. Si intenta `save_race_prediction`, llama a `motivoRechazo()` de [`src/lib/running.ts`](src/lib/running.ts): exige fitness de COROS en esta invocación, impide un tiempo demasiado optimista y protege las semanas cercanas a la carrera objetivo. Cuando hay motivo, asigna `event.cancel = motivo` y **la tool de guardado no se ejecuta**. Strands devuelve ese motivo al modelo como resultado de error para que pueda corregir su intento.
3. **`AfterToolCallEvent` — termina cada intento de tool, incluso uno cancelado.** Deja una traza `tool` con el input final y el estado, y añade el nombre a `toolsUsadas`. Si `queryFitnessAssessmentOverview` terminó bien, extrae su respuesta y guarda el fitness en `invocationState.fitness`. Así, un intento posterior de `save_race_prediction` puede compararse con datos reales.

El modelo pide `querySportRecords({ limit: 100 })` → el hook añade los códigos de running y cambia el límite a `30` → COROS recibe los argumentos corregidos → el resultado queda en las trazas. Luego, si el modelo intenta guardar una predicción sin haber consultado antes el fitness, `event.cancel` devuelve «Antes de predecir consulta queryFitnessAssessmentOverview…» y no se guarda nada.

### 4. Comprueba el resultado

En el chat, pide «Predice mi tiempo para un 10K cercano y guárdalo». Abre `/debug` y mira la secuencia `queryFitnessAssessmentOverview` → `fitness de COROS guardado en invocationState` → `save_race_prediction`. Si el modelo intenta guardar demasiado pronto o propone algo que incumple las reglas, verás `bloqueo save_race_prediction` y una llamada con estado `error`. También puedes pedir «Enséñame mis últimos 100 entrenamientos»: si el modelo envía `limit: 100`, aparecerá `querySportRecords: argumentos corregidos`.

## STEP 6 · Convertir especialistas en tools (minutos 18–21)

### 1. Ve a este fichero

[`src/agent/team.ts`](src/agent/team.ts), bloque `step 6`.

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
chatTeamTools = teamTools
```

### 3. Explica qué ocurre

`teamTools()` crea un Agent para cada especialista y usa `agent.asTool()`. En `getChatAgent()` esas tools entran en el array `tools` del coach. `addTeamHook()` adapta el resultado para que el coach no repita en pantalla lo que el especialista ya escribió.

### 4. Comprueba el resultado

Se habilitan las tarjetas del equipo. Pide en el chat la opinión del fisio y observa su intervención; también puedes pulsar «Regenerar» en una tarjeta.

## STEP 7 · Coordinar un Swarm (minutos 21–25)

### 1. Ve a este fichero

[`src/agent/swarm.ts`](src/agent/swarm.ts), bloque `step 7`.

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
swarmFactory = buildSwarm
```

### 3. Explica qué ocurre

`buildSwarm()` reúne cuatro Agent: analista, optimista, conservador y árbitro. Cada nodo devuelve un mensaje estructurado para pasar el testigo. El árbitro puede usar la tool de guardado, sujeta a los guardrails del step 5.

### 4. Comprueba el resultado

Pulsa «Predecir» en una carrera y sigue los relevos, tools y resultado en vivo.

## STEP 8 · Persistir sesión y estado (minutos 25–28)

### 1. Ve a este fichero

[`src/agent/session.ts`](src/agent/session.ts), bloque `step 8`.

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
sessionFactory = createSession
```

### 3. Explica qué ocurre

Vuelve a `getChatAgent()` en [`src/agent/chat.ts`](src/agent/chat.ts): `sessionManager: sessionFactory?.(sessionId)` ya le pasa el `SessionManager` al Agent, y `agent.initialize()` restaura su snapshot. También se añaden las tools de preferencias que leen y escriben `agent.appState`; un hook cuenta turnos. El chat de una sesión pasa de ventana deslizante a `SummarizingConversationManager`.

### 4. Comprueba el resultado

Abre «Cerebro del coach», cuenta una preferencia, usa «contexto» y reinicia el servidor para comprobar que la conversación persiste.

## STEP 9 · Añadir memoria duradera (minutos 28–30)

### 1. Ve a este fichero

[`src/agent/memory.ts`](src/agent/memory.ts)

### 2. Activa esta línea

Quita `//` para que quede así:

```ts
memoryFactory = createMemory
```

### 3. Explica qué ocurre

Vuelve al Agent de la portada: `memoryManager: memory` deja de ser `undefined`. `MemoryManager` puede guardar y buscar recuerdos con tools, inyecta hechos relevantes al comenzar un turno y extrae hechos duraderos después de la respuesta. `FileMemoryStore` los deja como archivos markdown.

### 4. Comprueba el resultado

Cuenta algo que deba recordar en el futuro. Espera unos segundos y abre «Cerebro del coach» para ver la memoria.

## Comprobar y recuperar

```bash
pnpm typecheck
pnpm build
```

Los e2e actuales describen la versión completa, así que durante los steps intermedios fallarán. Al acabar el step 9 puedes ejecutarlos con `pnpm test:e2e`: usan modelo y COROS falsos y no modifican los datos reales.

Cada archivo existente que modificamos tiene su versión completa original en la misma carpeta con sufijo `.original`. Para recuperar uno:

```bash
cp src/agent/chat.ts.original src/agent/chat.ts
```

Al acabar: `pnpm exec astro dev stop`.
