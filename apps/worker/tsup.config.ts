// apps/worker/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  bundle: true,
  noExternal: [/^@clipflow\//], // force-bundle all internal workspace packages
  external: [], // let real npm deps (ioredis, bullmq, etc.) stay external
  clean: true,
  sourcemap: true,
});