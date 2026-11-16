<!--
  A picture from the book alone and fullscreen, to zoom into and pan around
  (docs/SPEC.md, "A picture fullscreen, with zoom and pan"). One picture at a
  time; only Close or Escape closes it.
-->
<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity'
  import { t } from '../i18n/index.svelte'

  let dialog: HTMLDialogElement
  let stage = $state<HTMLDivElement>()
  let src = $state('')
  let alt = $state('')
  // The picture's own pixel size, and the stage's size, once known.
  let natural = $state({ width: 0, height: 0 })
  let room = $state({ width: 0, height: 0 })
  // Zoom relative to fitted, and the picture centre's offset from the stage's.
  let scale = $state(1)
  let x = $state(0)
  let y = $state(0)

  const STEP = 1.5
  const PAN = 50
  const DOUBLE_ZOOM = 2.5

  // Fitted: as large as the stage allows, keeping the picture's shape. A
  // picture with no size of its own fills the stage.
  const fitted = $derived.by(() => {
    const { width, height } = natural
    if (!width || !height) return { ...room }
    const ratio = Math.min(room.width / width, room.height / height)
    return { width: width * ratio, height: height * ratio }
  })
  // Up to four times fitted, or twice the picture's own size if that is more.
  const maxScale = $derived(Math.max(4, fitted.width ? (2 * natural.width) / fitted.width : 4))

  export function open(url: string, label: string): void {
    src = url
    alt = label
    natural = { width: 0, height: 0 }
    scale = 1
    x = 0
    y = 0
    dialog.showModal()
  }

  export function isOpen(): boolean {
    return dialog?.open ?? false
  }

  function close(): void {
    dialog.close()
  }

  // Keeps the picture on screen: an edge never comes inside the stage's edge
  // while the picture is larger than the stage, and it stays centred while not.
  function clamp(): void {
    const spareX = Math.max(0, (fitted.width * scale - room.width) / 2)
    const spareY = Math.max(0, (fitted.height * scale - room.height) / 2)
    x = Math.min(spareX, Math.max(-spareX, x))
    y = Math.min(spareY, Math.max(-spareY, y))
  }

  /** Zoom to `next`, keeping the point under (clientX, clientY) where it is. */
  function zoomTo(next: number, clientX?: number, clientY?: number): void {
    const target = Math.min(maxScale, Math.max(1, next))
    const rect = stage?.getBoundingClientRect()
    const px = rect && clientX !== undefined ? clientX - rect.left - rect.width / 2 : 0
    const py = rect && clientY !== undefined ? clientY - rect.top - rect.height / 2 : 0
    x = px - ((px - x) * target) / scale
    y = py - ((py - y) * target) / scale
    scale = target
    clamp()
  }

  function pan(dx: number, dy: number): void {
    x += dx
    y += dy
    clamp()
  }

  function measure(element: HTMLDivElement) {
    const observer = new ResizeObserver(() => {
      room = { width: element.clientWidth, height: element.clientHeight }
      clamp()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }

  // The wheel zooms; it must be able to cancel the page's own scroll, which
  // a passive listener cannot.
  function wheelZoom(element: HTMLDivElement) {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      // A trackpad pinch arrives as a wheel with ctrlKey and small deltas.
      const speed = event.ctrlKey ? 100 : 300
      zoomTo(scale * Math.exp(-event.deltaY / speed), event.clientX, event.clientY)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }

  // Pointers: one drags, two pinch, and a quick second tap in the same spot
  // toggles between fitted and zoomed in (a double-click is the same taps).
  const pointers = new SvelteMap<number, { x: number; y: number }>()
  let moved = false
  let lastTap = { time: 0, x: 0, y: 0 }

  function onPointerDown(event: PointerEvent): void {
    if ((event.target as Element).closest('button')) return
    try {
      stage?.setPointerCapture(event.pointerId)
    } catch {
      // A pointer the browser does not track (a synthetic one) still works.
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 1) moved = false
  }

  function onPointerMove(event: PointerEvent): void {
    const last = pointers.get(event.pointerId)
    if (!last) return
    const current = { x: event.clientX, y: event.clientY }
    if (pointers.size === 1) {
      if (Math.hypot(current.x - last.x, current.y - last.y) > 0) moved = true
      pan(current.x - last.x, current.y - last.y)
    } else if (pointers.size === 2) {
      moved = true
      const [a, b] = [...pointers.entries()].map(([id, point]) =>
        id === event.pointerId ? current : point,
      )
      const [oldA, oldB] = [...pointers.values()]
      const before = Math.hypot(oldA.x - oldB.x, oldA.y - oldB.y)
      const after = Math.hypot(a.x - b.x, a.y - b.y)
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const oldMiddle = { x: (oldA.x + oldB.x) / 2, y: (oldA.y + oldB.y) / 2 }
      if (before > 0) zoomTo((scale * after) / before, middle.x, middle.y)
      pan(middle.x - oldMiddle.x, middle.y - oldMiddle.y)
    }
    pointers.set(event.pointerId, current)
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pointers.delete(event.pointerId)) return
    if (moved || pointers.size > 0) return
    const now = performance.now()
    const near = Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 25
    if (now - lastTap.time < 350 && near) {
      if (scale > 1) zoomTo(1)
      else zoomTo(DOUBLE_ZOOM, event.clientX, event.clientY)
      lastTap = { time: 0, x: 0, y: 0 }
    } else {
      lastTap = { time: now, x: event.clientX, y: event.clientY }
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case '+':
      case '=':
        zoomTo(scale * STEP)
        break
      case '-':
        zoomTo(scale / STEP)
        break
      case 'ArrowLeft':
        pan(PAN, 0)
        break
      case 'ArrowRight':
        pan(-PAN, 0)
        break
      case 'ArrowUp':
        pan(0, PAN)
        break
      case 'ArrowDown':
        pan(0, -PAN)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  function onLoad(event: Event): void {
    const image = event.currentTarget as HTMLImageElement
    natural = { width: image.naturalWidth, height: image.naturalHeight }
  }
</script>

<dialog
  bind:this={dialog}
  class="picture"
  aria-label={alt || t('Picture')}
  onkeydown={onKeydown}
  onclose={() => (src = '')}
>
  <div
    class="picture-stage"
    bind:this={stage}
    {@attach measure}
    {@attach wheelZoom}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    role="presentation"
  >
    {#if src}
      <img
        {src}
        {alt}
        draggable="false"
        onload={onLoad}
        style:inline-size="{fitted.width}px"
        style:block-size="{fitted.height}px"
        style:transform="translate(-50%, -50%) translate({x}px, {y}px) scale({scale})"
      />
    {/if}
  </div>
  <div class="picture-controls">
    <button onclick={() => zoomTo(scale / STEP)} aria-label={t('Zoom out')} title={t('Zoom out')}
      >−</button
    >
    <button onclick={() => zoomTo(scale * STEP)} aria-label={t('Zoom in')} title={t('Zoom in')}
      >+</button
    >
    <button onclick={close} aria-label={t('Close')} title={t('Close')}>✕</button>
  </div>
</dialog>

<style>
  dialog.picture {
    box-sizing: border-box;
    inset: 0;
    inline-size: 100vw;
    block-size: 100svh;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: Canvas;
    color: CanvasText;
    overflow: hidden;
  }

  dialog.picture::backdrop {
    background: Canvas;
  }

  .picture-stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .picture-stage img {
    position: absolute;
    inset-block-start: 50%;
    /* Physical on purpose: the centring translate(-50%, -50%) is physical. */
    left: 50%;
    max-inline-size: none;
    transform-origin: center;
    -webkit-user-drag: none;
  }

  .picture-controls {
    position: absolute;
    inset-block-start: 0.5rem;
    inset-inline-end: 0.5rem;
    display: flex;
    gap: 0.5rem;
  }

  .picture-controls button {
    font-size: 1rem;
    min-inline-size: 2rem;
  }
</style>
