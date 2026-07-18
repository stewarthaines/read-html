import { renameSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { BUILD_TARGET, manifestLink, readhtmlVersion } from './vite.config'

// Second build target (§1): one self-contained READ.html that works offline
// from disk. viteSingleFile inlines all assets and collapses the vendored
// engine's dynamic imports into the single chunk.
export default defineConfig({
  plugins: [
    svelte(),
    readhtmlVersion(),
    manifestLink(),
    viteSingleFile(),
    {
      name: 'read-html-output-name',
      closeBundle() {
        renameSync('dist-single/index.html', 'dist-single/READ.html')
      },
    },
  ],
  build: { outDir: 'dist-single', target: BUILD_TARGET },
})
