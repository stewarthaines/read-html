import { expect, test } from 'vitest'
import { readWithProgress, type FetchProgress } from '../src/lib/catalog/fetch-progress'

function streamed(chunks: number[][], headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
      controller.close()
    },
  })
  return new Response(body, { headers })
}

test('reports bytes read against Content-Length and returns every byte', async () => {
  const seen: FetchProgress[] = []
  const blob = await readWithProgress(
    streamed([[1, 2], [3, 4, 5], [6]], { 'Content-Length': '6' }),
    (progress) => seen.push(progress),
  )
  expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 4, 5, 6])
  expect(seen).toEqual([
    { loaded: 2, total: 6 },
    { loaded: 5, total: 6 },
    { loaded: 6, total: 6 },
  ])
})

test('reports no total when the response has no Content-Length', async () => {
  const seen: FetchProgress[] = []
  await readWithProgress(streamed([[1, 2, 3]]), (progress) => seen.push(progress))
  expect(seen).toEqual([{ loaded: 3, total: null }])
})

test('drops the total once more bytes arrive than it promised (compressed transfer)', async () => {
  const seen: FetchProgress[] = []
  await readWithProgress(
    streamed(
      [
        [1, 2],
        [3, 4],
      ],
      { 'Content-Length': '3' },
    ),
    (progress) => seen.push(progress),
  )
  expect(seen).toEqual([
    { loaded: 2, total: 3 },
    { loaded: 4, total: null },
  ])
})

test('keeps the response media type on the blob', async () => {
  const blob = await readWithProgress(
    streamed([[1]], { 'Content-Type': 'application/epub+zip' }),
    () => {},
  )
  expect(blob.type).toBe('application/epub+zip')
})
