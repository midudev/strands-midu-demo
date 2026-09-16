// @ts-check
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  devToolbar: { enabled: false },
  security: {
    // Necesario para que Astro confíe en X-Forwarded-Proto/Host del reverse proxy (Caddy)
    // y url.origin sea https://strands.midu.run (el OAuth de COROS exige redirect_uri https)
    allowedDomains: [
      { hostname: 'strands.midu.run', protocol: 'https' },
      { hostname: 'localhost' },
    ],
  },
})
