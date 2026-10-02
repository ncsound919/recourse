import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    // The completion cache is a process-global production feature; disable it
    // for the suite so tests that assert model-call/retry behavior stay
    // deterministic. The cache's own test deletes this to exercise it.
    env: { MODEL_CACHE_DISABLED: '1' },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/recourse-fix-bundle/**',
      // Generated self-hosted tool artifacts (raw `assert` scripts, not vitest
      // suites) written by the forge/learner loops. They are runtime output,
      // not the test suite, and were producing 13 phantom collection failures.
      '**/skills-out/**',
      '**/.selfhosted/**',
      // Standalone driver checks (v5-skilltech, v5-planner, v5-deciders): they
      // self-run a main() and print PASS/FAIL when invoked via tsx. They hold
      // no vitest suites, so collecting them under vitest only produced
      // "No test suite found" + process.exit(1) phantom failures.
      'scripts/**/*.test.ts',
    ],
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
