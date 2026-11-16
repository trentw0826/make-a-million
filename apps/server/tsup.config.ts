import { defineConfig } from 'tsup';

export default defineConfig({
  // The bot worker is loaded by URL at runtime, so it needs its own output file.
  entry: ['src/index.ts', 'src/botWorker.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Workspace packages are TypeScript sources; bundle them into the server.
  noExternal: [/^@mam\//],
});
