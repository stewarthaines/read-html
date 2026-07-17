/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, type PluginOption } from 'vite'

// Stamps the readhtml-version meta (docs/PAYLOAD_SLOT.md) from package.json.
export function readhtmlVersion(): PluginOption {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string
  }
  return {
    name: 'readhtml-version',
    transformIndexHtml: (html) => html.replace('__READHTML_VERSION__', pkg.version),
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    svelte(),
    readhtmlVersion(),
    ...(mode === 'analyze'
      ? [visualizer({ open: true, filename: 'dist/stats.html', gzipSize: true })]
      : []),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}))
