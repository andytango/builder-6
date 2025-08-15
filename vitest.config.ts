import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.test for test environment, fallback to .env
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test' });
}
dotenv.config(); // Load .env as fallback

export default defineConfig({
  test: {
    threads: false,
    testTimeout: 30000, // 30 seconds
    hookTimeout: 120000, // 120 seconds
    coverage: {
      enabled: true,
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/lib/agent-sessions/prisma/generated/',
        'src/lib/database/prisma/generated/',
        'src/lib/agent/evaluation.ts',
        'src/lib/agent/evaluation.test.ts',
        'eslint.config.js',
        'vitest.config.ts',
        'src/index.ts',
        'check-coverage.js',
        'gitingest/**',
        '**/*.test.ts',
        '**/*.test.js',
        '**/*.spec.ts',
        '**/*.spec.js',
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
  resolve: {
    alias: {
      '../../docker-manager': path.resolve(__dirname, './src/lib/docker-manager'),
    },
  },
});