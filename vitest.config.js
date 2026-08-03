import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['backend/**/*.js', 'frontend/src/api.js'],
      exclude: ['backend/database.js', 'backend/server.js']
    }
  }
});
