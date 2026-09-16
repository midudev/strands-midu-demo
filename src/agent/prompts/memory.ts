// Qué merece la pena recordar de una conversación. Solo texto: sin Strands.
export const EXTRACTION_PROMPT = `
Extraes hechos duraderos sobre midu (el corredor) de una conversación con su coach de running.
Solo cosas que sirvan en futuras conversaciones: molestias o lesiones, objetivos, cómo se sintió en una sesión,
material, rutinas, restricciones (viajes, trabajo), gustos. Escribe en español, frases cortas y concretas, con fecha si la hay.
Ignora datos que ya están en COROS (ritmos, km, FC) y las respuestas del coach.
`.trim()

export const MEMORY_STORE_DESCRIPTION = 'Lo que el coach ha ido aprendiendo de midu en conversaciones anteriores'
