// Read a fetch response's body as it streams, reporting bytes read, so a
// `?book=` download can show its progress. `total` is the response's
// Content-Length, or null when it has none — or when more bytes arrive than it
// promised, as with a compressed transfer, where the header counts the
// compressed size and the stream yields the decoded bytes.

export interface FetchProgress {
  loaded: number
  total: number | null
}

export async function readWithProgress(
  response: Response,
  onprogress: (progress: FetchProgress) => void,
): Promise<Blob> {
  const type = response.headers.get('Content-Type') ?? ''
  if (!response.body) return response.blob()
  const header = Number(response.headers.get('Content-Length'))
  const declared = Number.isFinite(header) && header > 0 ? header : null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onprogress({ loaded, total: declared !== null && loaded <= declared ? declared : null })
  }
  return new Blob(chunks as BlobPart[], { type })
}
