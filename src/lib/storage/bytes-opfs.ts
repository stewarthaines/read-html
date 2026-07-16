import type { BookStorage, OpfsDirectory } from './types'

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

export class OpfsBookStorage implements BookStorage {
  readonly kind = 'opfs' as const

  constructor(private readonly root: OpfsDirectory) {}

  async put(id: string, file: Blob): Promise<void> {
    const handle = await this.root.getFileHandle(id, { create: true })
    if (typeof handle.createWritable !== 'function') {
      throw new Error('OPFS handle does not support createWritable')
    }
    const writable = await handle.createWritable()
    await writable.write(file)
    await writable.close()
  }

  async get(id: string): Promise<Blob | null> {
    try {
      const handle = await this.root.getFileHandle(id)
      return await handle.getFile()
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.root.removeEntry(id)
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
}
