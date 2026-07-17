// Embedded-payload slot (docs/PAYLOAD_SLOT.md): the built page carries one
// inert script element a publishing tool may fill with a base64 EPUB. A
// non-empty slot boots the reader straight into that book.
const SLOT_ID = 'readhtml-payload'

export function decodePayload(base64: string): File {
  const binary = atob(base64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], 'embedded-book.epub', { type: 'application/epub+zip' })
}

/** Returns the embedded book, null when the slot is empty or absent. */
export function readEmbeddedPayload(): File | null {
  const content = document.getElementById(SLOT_ID)?.textContent?.trim()
  return content ? decodePayload(content) : null
}
