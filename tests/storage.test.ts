// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { IdbBookStorage } from '../src/lib/storage/bytes-idb'
import { MemoryBookStorage } from '../src/lib/storage/bytes-memory'
import { OpfsBookStorage } from '../src/lib/storage/bytes-opfs'
import { createBookStorage } from '../src/lib/storage/index'
import { sha256Hex } from '../src/lib/storage/hash'
import type { OpfsDirectory, OpfsFileHandle } from '../src/lib/storage/types'

const blobText = async (blob: Blob | null) => (blob ? await blob.text() : null)

// In-memory OPFS mock (§7: mock OPFS where needed).
function makeOpfsRoot(options: { createWritable?: boolean } = {}): OpfsDirectory {
  const files = new Map<string, Blob>()
  const supportsWritable = options.createWritable ?? true
  return {
    async getFileHandle(name, opts) {
      if (!files.has(name)) {
        if (!opts?.create) throw new DOMException('not found', 'NotFoundError')
        files.set(name, new Blob([]))
      }
      const handle: OpfsFileHandle = {
        async getFile() {
          const blob = files.get(name)
          if (!blob) throw new DOMException('not found', 'NotFoundError')
          return new File([blob], name)
        },
      }
      if (supportsWritable) {
        handle.createWritable = async () => {
          let content = new Blob([])
          return {
            async write(data: Blob) {
              content = data
            },
            async close() {
              files.set(name, content)
            },
          }
        }
      }
      return handle
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw new DOMException('not found', 'NotFoundError')
    },
  }
}

interface StorageNavigator {
  storage?: { getDirectory?: () => Promise<OpfsDirectory> }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  delete (navigator as StorageNavigator).storage
})

for (const [label, make] of [
  ['OPFS backend', () => new OpfsBookStorage(makeOpfsRoot())],
  ['IDB backend', () => new IdbBookStorage()],
  ['memory backend', () => new MemoryBookStorage()],
] as const) {
  test(`${label}: put/get round-trips the exact bytes`, async () => {
    const storage = make()
    await storage.put('abc', new Blob(['book bytes here'], { type: 'application/epub+zip' }))
    expect(await blobText(await storage.get('abc'))).toBe('book bytes here')
  })

  test(`${label}: get of an unknown id resolves null`, async () => {
    expect(await make().get('missing')).toBeNull()
  })

  test(`${label}: put overwrites, delete removes`, async () => {
    const storage = make()
    await storage.put('abc', new Blob(['first']))
    await storage.put('abc', new Blob(['second']))
    expect(await blobText(await storage.get('abc'))).toBe('second')
    await storage.delete('abc')
    expect(await storage.get('abc')).toBeNull()
  })

  test(`${label}: delete of an unknown id does not throw`, async () => {
    await expect(make().delete('missing')).resolves.toBeUndefined()
  })
}

test('createBookStorage picks OPFS when getDirectory and createWritable exist', async () => {
  ;(navigator as StorageNavigator).storage = {
    getDirectory: async () => makeOpfsRoot(),
  }
  expect((await createBookStorage()).kind).toBe('opfs')
})

test('createBookStorage falls back to IDB when createWritable is unsupported', async () => {
  ;(navigator as StorageNavigator).storage = {
    getDirectory: async () => makeOpfsRoot({ createWritable: false }),
  }
  expect((await createBookStorage()).kind).toBe('idb')
})

test('createBookStorage falls back to IDB when OPFS is absent entirely', async () => {
  expect((await createBookStorage()).kind).toBe('idb')
})

test('createBookStorage falls back to memory when IndexedDB refuses to open', async () => {
  // Feature 11: some environments expose the API but reject open calls.
  globalThis.indexedDB = {
    open() {
      throw new DOMException('blocked', 'SecurityError')
    },
  } as unknown as IDBFactory
  expect((await createBookStorage()).kind).toBe('memory')
})

test('sha256Hex hashes blob bytes to lowercase hex', async () => {
  // printf 'abc' | shasum -a 256
  expect(await sha256Hex(new Blob(['abc']))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})
