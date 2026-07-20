// Reactive settings store (§3.5, §3.2): runes-based, localStorage-backed
// under a readhtml_* key. Every localStorage read/write is try/catch-wrapped
// with defaults on failure (spec-mandated posture for app state).
import { LS_SETTINGS } from '../storage/keys'

export type Flow = 'paginated' | 'scrolled'
// Column count while paginated: 'auto' lets the paginator fit up to two
// columns to the viewport, 'single' clamps it to one at any width. Orthogonal
// to flow — the choice is kept while scrolled, and applies again on return.
export type Spread = 'auto' | 'single'
export type Theme = 'auto' | 'light' | 'dark'

export interface Settings {
  flow: Flow
  spread: Spread
  fontSize: number
  theme: Theme
}

export const FONT_SIZE_MIN = 70
export const FONT_SIZE_MAX = 150

const DEFAULTS: Settings = { flow: 'paginated', spread: 'auto', fontSize: 100, theme: 'auto' }

function clampFontSize(value: unknown): number {
  const size = Number(value)
  if (!Number.isFinite(size)) return DEFAULTS.fontSize
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(size)))
}

function sanitize(value: unknown): Settings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<
    Record<keyof Settings, unknown>
  >
  return {
    flow: raw.flow === 'scrolled' ? 'scrolled' : DEFAULTS.flow,
    spread: raw.spread === 'single' ? 'single' : DEFAULTS.spread,
    fontSize: clampFontSize(raw.fontSize ?? DEFAULTS.fontSize),
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : DEFAULTS.theme,
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    return raw ? sanitize(JSON.parse(raw)) : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(value: Settings): void {
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(value))
  } catch {
    // Storage unavailable: settings live for the session only.
  }
}

const state = $state(load())

export const settings = {
  get flow() {
    return state.flow
  },
  set flow(value: Flow) {
    state.flow = value
    save(state)
  },
  get spread() {
    return state.spread
  },
  set spread(value: Spread) {
    state.spread = value
    save(state)
  },
  get fontSize() {
    return state.fontSize
  },
  set fontSize(value: number) {
    state.fontSize = clampFontSize(value)
    save(state)
  },
  get theme() {
    return state.theme
  },
  set theme(value: Theme) {
    state.theme = value
    save(state)
  },
}

/** Re-reads settings from localStorage (used by unit tests). */
export function reloadSettings(): void {
  Object.assign(state, load())
}
