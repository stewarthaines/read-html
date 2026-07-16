import type { Settings } from '../settings/index.svelte'

// User-settings stylesheet injected into every book section (§3.5) via the
// renderer's setStyles. Font size is a root percentage that publisher styles
// cascade under. Dark mode constrains the section's color-scheme: default
// (UA) colors and the paginator's mirrored background flip with it, while
// explicit publisher colors are left alone — never inversion filters, which
// destroy images.
export function bookContentCss(settings: Settings): string {
  const scheme = settings.theme === 'auto' ? 'light dark' : settings.theme
  return `:root {
  color-scheme: ${scheme};
  font-size: ${settings.fontSize}%;
}`
}
