// Minimal reactive i18n (§3.6): gettext-style lookup where the key is the
// English source string, so strings are extractable as message catalogs
// without a build pipeline. English ships as the empty catalog — lookups
// fall back to the key. Switching to an RTL locale flips the document
// direction; app styles use logical properties throughout, so the UI
// follows. English is the only shipped catalog at launch.
const catalogs: Record<string, Record<string, string>> = { en: {} }

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur'])

const state = $state({ locale: 'en' })

export function t(message: string): string {
  return catalogs[state.locale]?.[message] ?? message
}

export function locale(): string {
  return state.locale
}

export function localeDir(tag: string = state.locale): 'ltr' | 'rtl' {
  const primary = tag.split('-')[0].toLowerCase()
  return RTL_LOCALES.has(primary) ? 'rtl' : 'ltr'
}

export function setLocale(tag: string): void {
  state.locale = tag
  document.documentElement.lang = tag
  document.documentElement.dir = localeDir(tag)
}
