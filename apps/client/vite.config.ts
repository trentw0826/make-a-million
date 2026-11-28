/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The style guide (styleguide.html) is dev-only: `pnpm dev` serves it, and a build includes it
 * only when STYLEGUIDE=1, as `pnpm e2e` sets so it can screenshot it. A deploy leaves it out.
 */
const pages = {
  main: resolve(import.meta.dirname, 'index.html'),
  ...(process.env.STYLEGUIDE === '1'
    ? { styleguide: resolve(import.meta.dirname, 'styleguide.html') }
    : {}),
};

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: { input: pages },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
