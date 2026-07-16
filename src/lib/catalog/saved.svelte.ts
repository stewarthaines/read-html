// Saved catalog URLs (§3.2 app state, §3.7): localStorage-backed reactive
// list. Each read/write is try/catch-wrapped with defaults on failure.
// `trustBooks` is §3.4 step 4's publisher-allowlist model: books acquired
// through a trusted catalog are auto-consented at import.
import { LS_CATALOGS } from '../storage/keys'

export interface SavedCatalog {
  url: string
  title: string
  trustBooks: boolean
}

function sanitize(value: unknown): SavedCatalog[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const raw = entry as Partial<Record<keyof SavedCatalog, unknown>>
    if (typeof raw?.url !== 'string' || raw.url === '') return []
    return [
      {
        url: raw.url,
        title: typeof raw.title === 'string' ? raw.title : raw.url,
        trustBooks: raw.trustBooks === true,
      },
    ]
  })
}

function load(): SavedCatalog[] {
  try {
    const raw = localStorage.getItem(LS_CATALOGS)
    return raw ? sanitize(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function save(list: SavedCatalog[]): void {
  try {
    localStorage.setItem(LS_CATALOGS, JSON.stringify(list))
  } catch {
    // Storage unavailable: the list lives for the session only.
  }
}

const state = $state({ list: load() })

export function savedCatalogs(): SavedCatalog[] {
  return state.list
}

export function saveCatalog(url: string, title: string): void {
  if (state.list.some((entry) => entry.url === url)) return
  state.list = [...state.list, { url, title: title || url, trustBooks: false }]
  save(state.list)
}

export function removeCatalog(url: string): void {
  state.list = state.list.filter((entry) => entry.url !== url)
  save(state.list)
}

export function setCatalogTrust(url: string, trustBooks: boolean): void {
  state.list = state.list.map((entry) => (entry.url === url ? { ...entry, trustBooks } : entry))
  save(state.list)
}

/** Re-reads from localStorage (used by unit tests). */
export function reloadCatalogs(): void {
  state.list = load()
}
