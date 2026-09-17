// Qué merece la pena recordar de una conversación. Solo texto: sin Strands.
import type { RunnerProfile } from '../../lib/runner'

export const extractionPrompt = (runner: RunnerProfile) =>
  `
Extraes hechos duraderos sobre ${runner.nombre} (el corredor) de una conversación con su coach de running.
Solo cosas que sirvan en futuras conversaciones: molestias o lesiones, objetivos, cómo se sintió en una sesión,
material, rutinas, restricciones (viajes, trabajo), gustos. Escribe en español, frases cortas y concretas, con fecha si la hay.
Ignora datos que ya están en COROS (ritmos, km, FC) y las respuestas del coach.
`.trim()

export const memoryStoreDescription = (runner: RunnerProfile) =>
  `Lo que el coach ha ido aprendiendo de ${runner.nombre} en conversaciones anteriores`
