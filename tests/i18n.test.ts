// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { locale, localeDir, setLocale, t } from '../src/lib/i18n/index.svelte'

afterEach(() => {
  setLocale('en')
})

test('t falls back to the English source key', () => {
  expect(t('Open a book')).toBe('Open a book')
})

test('localeDir classifies RTL locales including region subtags', () => {
  expect(localeDir('en')).toBe('ltr')
  expect(localeDir('ar')).toBe('rtl')
  expect(localeDir('he-IL')).toBe('rtl')
  expect(localeDir('fa')).toBe('rtl')
  expect(localeDir('de-AT')).toBe('ltr')
})

test('setLocale updates the store and the document element', () => {
  setLocale('ar')
  expect(locale()).toBe('ar')
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ar')

  setLocale('en')
  expect(document.documentElement.dir).toBe('ltr')
  expect(document.documentElement.lang).toBe('en')
})

test('t for an unshipped locale falls back to the key', () => {
  setLocale('ar')
  expect(t('Open a book')).toBe('Open a book')
})
