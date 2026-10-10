import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Endereço público: domínio definitivo da Ludus desde 10/10/2026 (ludus.avilaops.com redireciona para cá).
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://ludusequipamentos.com',
  trailingSlash: 'always',
  integrations: [sitemap()],
  build: { format: 'directory' },
  vite: {
    build: { chunkSizeWarningLimit: 1200 },
  },
});
