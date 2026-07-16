/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    svelte(),
    ...(mode === 'analyze'
      ? [visualizer({ open: true, filename: 'dist/stats.html', gzipSize: true })]
      : []),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}))
