import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative Pfade, damit die Seite unter https://tnd00.github.io/schnautz/ und lokal gleich funktioniert
  base: './',
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
