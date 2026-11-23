import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

/** Jeder Build bekommt eine eigene Kennung. Offene Seiten vergleichen sie mit version.json und melden Updates. */
const BUILD_ID = `${pkg.version}-${Date.now().toString(36)}`;

export default defineConfig({
  // Relative Pfade, damit die Seite unter https://tnd00.github.io/schnautz/ und lokal gleich funktioniert
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    {
      name: 'version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: pkg.version, build: BUILD_ID }),
        });
      },
    },
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Die Zufallspartien (tausende ganze Spiele) brauchen etwas länger als das Standardlimit
    testTimeout: 60_000,
  },
});
