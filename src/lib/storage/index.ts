import { OPFS_BOOKS_DIR, OPFS_PROBE_FILE } from './keys'
import { IdbBookStorage } from './bytes-idb'
import { MemoryBookStorage } from './bytes-memory'
import { OpfsBookStorage } from './bytes-opfs'
import { openDatabase } from './idb'
import type { BookStorage, OpfsDirectory } from './types'

// Real OPFS roots expose getDirectoryHandle; the injected test mock does not,
// in which case books live directly in the injected directory.
interface OpfsRoot extends OpfsDirectory {
  getDirectoryHandle?(name: string, options?: { create?: boolean }): Promise<OpfsDirectory>
}

async function detectOpfsDir(): Promise<OpfsDirectory | null> {
  if (typeof navigator.storage?.getDirectory !== 'function') return null
  const root: OpfsRoot = await navigator.storage.getDirectory()
  const dir =
    typeof root.getDirectoryHandle === 'function'
      ? await root.getDirectoryHandle(OPFS_BOOKS_DIR, { create: true })
      : root
  // Probe a real write: some browsers expose OPFS handles without createWritable
  // (notably Safari outside workers), and those need the IndexedDB fallback.
  const probe = await dir.getFileHandle(OPFS_PROBE_FILE, { create: true })
  if (typeof probe.createWritable !== 'function') return null
  const writable = await probe.createWritable()
  await writable.close()
  await dir.removeEntry(OPFS_PROBE_FILE)
  return dir
}

export async function createBookStorage(): Promise<BookStorage> {
  try {
    const dir = await detectOpfsDir()
    if (dir) return new OpfsBookStorage(dir)
  } catch {
    // Any OPFS failure means the IndexedDB backend takes over.
  }
  // Feature 11: probe IndexedDB by really opening the database — some
  // environments (file:// in some engines, private modes) expose the API but
  // refuse to open. Last resort is the in-memory backend; the app notices
  // its kind and warns that nothing will persist.
  try {
    const db = await openDatabase()
    db.close()
    return new IdbBookStorage()
  } catch {
    return new MemoryBookStorage()
  }
}
