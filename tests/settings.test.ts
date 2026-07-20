// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  reloadSettings,
  settings,
} from '../src/lib/settings/index.svelte'
import { LS_SETTINGS } from '../src/lib/storage/keys'

beforeEach(() => {
  localStorage.clear()
  reloadSettings()
})

test('defaults: paginated flow, auto columns, 100% font size, auto theme', () => {
  expect(settings.flow).toBe('paginated')
  expect(settings.spread).toBe('auto')
  expect(settings.fontSize).toBe(100)
  expect(settings.theme).toBe('auto')
})

test('setters persist to localStorage under the readhtml key', () => {
  settings.flow = 'scrolled'
  settings.spread = 'single'
  settings.fontSize = 130
  settings.theme = 'dark'
  const stored = JSON.parse(localStorage.getItem(LS_SETTINGS) ?? '{}')
  expect(stored).toEqual({ flow: 'scrolled', spread: 'single', fontSize: 130, theme: 'dark' })
})

test('reloadSettings picks up stored values', () => {
  localStorage.setItem(
    LS_SETTINGS,
    JSON.stringify({ flow: 'scrolled', spread: 'single', fontSize: 90, theme: 'light' }),
  )
  reloadSettings()
  expect(settings.flow).toBe('scrolled')
  expect(settings.spread).toBe('single')
  expect(settings.fontSize).toBe(90)
  expect(settings.theme).toBe('light')
})

test('corrupt JSON falls back to defaults', () => {
  localStorage.setItem(LS_SETTINGS, '{not json')
  reloadSettings()
  expect(settings.flow).toBe('paginated')
  expect(settings.spread).toBe('auto')
  expect(settings.fontSize).toBe(100)
  expect(settings.theme).toBe('auto')
})

test('invalid stored values sanitize to defaults or clamp', () => {
  localStorage.setItem(
    LS_SETTINGS,
    JSON.stringify({ flow: 'diagonal', spread: 'triple', fontSize: 9000, theme: 'sepia' }),
  )
  reloadSettings()
  expect(settings.flow).toBe('paginated')
  expect(settings.spread).toBe('auto')
  expect(settings.fontSize).toBe(FONT_SIZE_MAX)
  expect(settings.theme).toBe('auto')
})

test('font size setter clamps to bounds and rejects NaN', () => {
  settings.fontSize = 10
  expect(settings.fontSize).toBe(FONT_SIZE_MIN)
  settings.fontSize = 500
  expect(settings.fontSize).toBe(FONT_SIZE_MAX)
  settings.fontSize = Number.NaN
  expect(settings.fontSize).toBe(100)
})
