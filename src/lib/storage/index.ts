import { OPFS_BOOKS_DIR, OPFS_PROBE_FILE } from './keys'
import { IdbBookStorage } from './bytes-idb'
import { OpfsBookStorage } from './bytes-opfs'
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
  return new IdbBookStorage()
}
