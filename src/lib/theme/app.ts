import type { Theme } from '../settings/index.svelte'

// App chrome uses system colors (Canvas/CanvasText), which follow the
// document color-scheme — so a manual theme override is just constraining
// color-scheme, and 'auto' restores the prefers-color-scheme default (§3.5).
export function applyAppTheme(theme: Theme): void {
  document.documentElement.style.colorScheme = theme === 'auto' ? 'light dark' : theme
}
