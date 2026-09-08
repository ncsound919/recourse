import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    // Real service probes in science/orchestrator tests need room under
    // full-suite parallel load (vitest default 5s was flaky).
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**', 'src/lego/**', 'src/dream/**'],
      exclude: ['src/**/*.d.ts', 'src/components/**', 'src/main.tsx', 'src/types.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
