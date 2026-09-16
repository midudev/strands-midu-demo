/**
 * Lee una variable de entorno.
 * Funciona igual dentro de Astro (import.meta.env) y en scripts Node sueltos (process.env).
 */
export function env(key: string, fallback?: string): string | undefined {
  const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env

  return viteEnv?.[key] ?? process.env[key] ?? fallback
}
