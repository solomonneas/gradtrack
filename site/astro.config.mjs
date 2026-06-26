import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'http://localhost:4321',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
  server: {
    port: 4321,
  },
});
