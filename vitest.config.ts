import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/recourse-fix-bundle/**'],
    // Real service probes in science/orchestrator tests need room under
    // full-suite parallel load (vitest default 5s was flaky).
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**', 'src/lego/**', 'src/dream/**', 'src/intake/**'],
      exclude: [
        'src/**/*.d.ts',
        'src/components/**',
        'src/main.tsx',
        'src/types.ts',
        // Pure type modules — no runtime to cover.
        'src/dream/learner-types.ts',
        'src/dream/mutator-types.ts',
        'src/dream/types.ts',
        'src/intake/types.ts',
        'src/intake/corpus/types.ts',
        'src/lego/types.ts',
        'src/lib/types/**',
        'src/lib/memory/types.ts',
        // Pure type module — no runtime to cover.
        'src/lib/synergy/types.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
