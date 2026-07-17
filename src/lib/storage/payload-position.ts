// Reading positions for embedded-payload books (docs/PAYLOAD_SLOT.md): a
// dedicated localStorage key mapping content hash -> CFI. Deliberately not
// the library metadata store — a payload book must leave no library record.
// Best-effort per §3.2: reads and writes are try/catch-wrapped.
import { LS_PAYLOAD_POSITIONS } from './keys'

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_PAYLOAD_POSITIONS)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function readPayloadPosition(id: string): string | null {
  const value = readAll()[id]
  return typeof value === 'string' ? value : null
}

export function writePayloadPosition(id: string, cfi: string): void {
  try {
    localStorage.setItem(LS_PAYLOAD_POSITIONS, JSON.stringify({ ...readAll(), [id]: cfi }))
  } catch {
    // Storage unavailable: the position lives for the session only.
  }
}
