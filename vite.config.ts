/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, type PluginOption } from 'vite'

// Supported-browser floor (~late 2022): Safari 16 is the point — devices
// capped at iOS 16, e.g. iPhone 8 — with contemporaneous engine versions.
// esbuild down-levels newer syntax to this floor; runtime API gaps (e.g.
// Object.groupBy) are handled by src/lib/polyfills.ts. Shared by both builds.
export const BUILD_TARGET = ['chrome107', 'edge107', 'firefox104', 'safari16']

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

// Host-provided web-app manifest link (docs/PWA_MANIFEST.md). Injected as a
// tag rather than placed statically so Vite does not try to resolve or hash
// the manifest — the repo ships none; the relative href resolves against
// wherever a host serves the file, and dangles harmlessly when absent.
export function manifestLink(): PluginOption {
  return {
    name: 'readhtml-manifest',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: 'READ.webmanifest' }, injectTo: 'head' },
      ]
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    svelte(),
    readhtmlVersion(),
    manifestLink(),
    ...(mode === 'analyze'
      ? [visualizer({ open: true, filename: 'dist/stats.html', gzipSize: true })]
      : []),
  ],
  build: {
    target: BUILD_TARGET,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}))
