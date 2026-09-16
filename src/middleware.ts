import { defineMiddleware } from 'astro:middleware'
import { trace } from './lib/trace'

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/debug')) return next()
  const t0 = Date.now()
  const res = await next()
  trace('http', `${request.method} ${url.pathname} ${res.status}`, { ms: Date.now() - t0 })
  return res
})
