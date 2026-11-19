import { defineConfig } from 'vitest/config';

// Tests run from the repo root (vite.config.ts sets root to web/ for the page build).
export default defineConfig({
  test: { root: '.', include: ['tests/**/*.test.ts'] },
});
