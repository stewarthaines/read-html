import type { BookStorage } from './types'

// Feature 11 last resort: some environments (file:// in some engines,
// private modes) refuse all persistent storage. Reading still works; the
// library lives only until the page closes, and the app shows a notice.
export class MemoryBookStorage implements BookStorage {
  readonly kind = 'memory'
  #files = new Map<string, Blob>()

  async put(id: string, file: Blob): Promise<void> {
    this.#files.set(id, file)
  }

  async get(id: string): Promise<Blob | null> {
    return this.#files.get(id) ?? null
  }

  async delete(id: string): Promise<void> {
    this.#files.delete(id)
  }
}
