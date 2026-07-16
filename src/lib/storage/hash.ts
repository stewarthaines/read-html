// SHA-256 of the book bytes is the book id (§3.2): dedupes re-imports.
export async function sha256Hex(blob: Blob): Promise<string> {
  // The Uint8Array wrapper keeps webcrypto happy when Blob.arrayBuffer()
  // returns a cross-realm ArrayBuffer (jsdom); browsers are unaffected.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(await blob.arrayBuffer()))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
