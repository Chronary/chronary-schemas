import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/events.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  // @chronary/shared is a private workspace-only package. Inline its code
  // into the published output so consumers have no runtime dependency on
  // it. External consumers only need `zod`.
  noExternal: ['@chronary/shared'],
});
