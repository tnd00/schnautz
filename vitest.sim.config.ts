import { defineConfig } from 'vitest/config';

// KI-Kalibrierung: spielt viele ganze Partien zwischen den KI-Stufen (npm run sim)
export default defineConfig({
  test: {
    include: ['tests/sim/**/*.sim.ts'],
    environment: 'node',
    testTimeout: 600_000,
    silent: false,
  },
});
