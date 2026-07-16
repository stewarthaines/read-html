// Downscale a cover image for the library grid: real covers can be
// megabytes, and the metadata records are read on every library render.
// SVG covers pass through (vector, already small). If decoding or encoding
// fails, the original cover is kept — a full-size cover is correct data,
// just unoptimized.
const MAX_EDGE = 256

export async function makeCoverThumb(cover: Blob): Promise<Blob> {
  if (cover.type === 'image/svg+xml') return cover
  const url = URL.createObjectURL(cover)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    if (scale === 1) return cover
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    const thumb = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8),
    )
    return thumb ?? cover
  } catch {
    return cover
  } finally {
    URL.revokeObjectURL(url)
  }
}
