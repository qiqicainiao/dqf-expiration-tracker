import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://dqfsuite.com',
  output: 'static',
  integrations: [react()],
  build: {
    format: 'directory',
  },

  vite: {
    server: {
      proxy: {
        '/bff': process.env.BFF_PROXY_TARGET || 'http://127.0.0.1:8090',
      },
    },
  },
});
