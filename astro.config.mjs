import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Endereço público. Enquanto o domínio da Ludus não aponta para cá, o site roda em ludus.avilaops.com.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://ludus.avilaops.com',
  trailingSlash: 'always',
  integrations: [sitemap()],
  build: { format: 'directory' },
  vite: {
    build: { chunkSizeWarningLimit: 1200 },
  },
});
