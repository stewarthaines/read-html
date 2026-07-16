// Minimal gettext-style lookup (§3.6): the key is the English source string,
// so strings are extractable as message catalogs without a build pipeline.
// English ships as the empty catalog — lookups fall back to the key itself.
// Locale switching and RTL document direction land at M4.
const catalogs: Record<string, Record<string, string>> = { en: {} }
const locale = 'en'

export function t(message: string): string {
  return catalogs[locale][message] ?? message
}
