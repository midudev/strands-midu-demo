// Helpers compartidos por los endpoints de src/pages/api/. Sin Strands.
import { isCorosConnected } from '../agent/coros/auth'

import { hasRunner } from './runner'

/** 401 si COROS no está conectado; null si todo bien. Uso: `const notConnected = requireCoros(); if (notConnected) return notConnected` */
export function requireCoros(): Response | null {
  if (isCorosConnected()) return null

  return Response.json({ error: 'COROS no conectado' }, { status: 401 })
}

/** 409 si aún no hay perfil del corredor (falta la bienvenida); null si todo bien. */
export function requireRunner(): Response | null {
  if (hasRunner()) return null

  return Response.json({ error: 'Falta el perfil del corredor' }, { status: 409 })
}

/** COROS conectado y perfil creado: lo que necesita todo lo que no sea la propia bienvenida. */
export const requireReady = () => requireCoros() ?? requireRunner()

/** Respuesta de error JSON a partir de una excepción. */
export function apiError(err: unknown, status = 500): Response {
  return Response.json({ error: (err as Error).message }, { status })
}

/**
 * Respuesta en streaming NDJSON: una línea JSON por chunk del generador.
 * Si el generador lanza, la última línea es { type: 'error', message } y el stream se cierra.
 */
export function ndjson<T>(chunks: AsyncIterable<T>): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'))

      try {
        for await (const chunk of chunks) send(chunk)
      } catch (err) {
        console.error(err)
        send({ type: 'error', message: (err as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}

/** Un runId válido es numérico (labelId de COROS). Devuelve undefined si no lo es. */
export function runIdOf(value: string | null | undefined): string | undefined {
  return value && /^\d+$/.test(value) ? value : undefined
}
