import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs work for both repository pages and custom domains.
  base: './',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    emptyOutDir: false,
  },
});
