/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  worker: {
    // ES module workers can be code-split: data loaded with import() inside a
    // worker (e.g. the legacy block table) becomes its own chunk instead of
    // being inlined. Workers are created with { type: 'module' }.
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
