import { defineConfig } from 'vite';

export default defineConfig({
  root: 'liquid-game',
  publicDir: '../liquid_bamboo',
  base: './',
  build: {
    emptyOutDir: true,
  },
});
