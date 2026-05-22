import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/state/**', 'src/simulation/**', 'src/event-bus/**', 'src/input/**'],
    },
  },
});