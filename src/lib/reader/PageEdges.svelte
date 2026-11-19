<!--
  The blank band either side of the book turns the page on a click, for a
  desktop reader with a mouse (docs/SPEC.md, "Page edges for the mouse").
  Each band covers only space the book leaves blank, measured from the
  renderer on every page turn and resize, and is left out when narrower than
  2rem. A mouse convenience duplicating the toolbar's Previous and Next, so
  hidden from assistive technology, out of the tab order, and focus stays put.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import { blankBands, type FoliateViewElement } from './foliate'

  interface Props {
    view: FoliateViewElement
  }
  let { view }: Props = $props()

  // 2rem at the root font size; narrower bands are too small to aim at and
  // usually mean a fixed-layout page that fills the width.
  const MIN_REM = 2

  let stage: HTMLDivElement
  let left = $state<{ offset: number; width: number } | null>(null)
  let right = $state<{ offset: number; width: number } | null>(null)

  function measure(): void {
    const bands = blankBands(view)
    const min = MIN_REM * parseFloat(getComputedStyle(document.documentElement).fontSize)
    if (!bands || !stage) {
      left = right = null
      return
    }
    const area = stage.getBoundingClientRect()
    left = bands.left >= min ? { offset: bands.box.left - area.left, width: bands.left } : null
    right = bands.right >= min ? { offset: area.right - bands.box.right, width: bands.right } : null
  }

  // Layout settles a frame after foliate's events, so measure on the next one.
  let frame = 0
  function schedule(): void {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }

  onMount(() => {
    const observer = new ResizeObserver(schedule)
    observer.observe(view)
    view.addEventListener('relocate', schedule)
    view.addEventListener('load', schedule)
    // Changing flow re-lays out without a resize of the view.
    const attributes = new MutationObserver(schedule)
    attributes.observe(view.renderer, { attributes: true, attributeFilter: ['flow'] })
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      attributes.disconnect()
      view.removeEventListener('relocate', schedule)
      view.removeEventListener('load', schedule)
    }
  })

  // A click on a band must not move focus off whatever had it.
  function keepFocus(event: MouseEvent): void {
    event.preventDefault()
  }
</script>

{#snippet chevron(points: string)}
  <svg viewBox="0 0 16 16" width="24" height="24" aria-hidden="true">
    <path
      d={points}
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}

<!-- Physical sides, like the arrow keys (§3.3): goLeft/goRight map them to
     reading order from the book's progression direction, so the bands are
     placed with left/right rather than logical properties. -->
<div class="edges" bind:this={stage}>
  {#if left}
    <button
      class="edge"
      style:left="{left.offset}px"
      style:width="{left.width}px"
      tabindex="-1"
      aria-hidden="true"
      onmousedown={keepFocus}
      onclick={() => view.goLeft()}>{@render chevron('M10 3 5 8l5 5')}</button
    >
  {/if}
  {#if right}
    <button
      class="edge"
      style:right="{right.offset}px"
      style:width="{right.width}px"
      tabindex="-1"
      aria-hidden="true"
      onmousedown={keepFocus}
      onclick={() => view.goRight()}>{@render chevron('M6 3l5 5-5 5')}</button
    >
  {/if}
</div>

<style>
  /* Over the book's area without taking its clicks: only the bands do. */
  .edges {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .edge {
    position: absolute;
    inset-block: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: CanvasText;
    cursor: pointer;
    pointer-events: auto;
  }

  .edge svg {
    opacity: 0;
  }

  .edge:hover {
    background: color-mix(in srgb, CanvasText 6%, transparent);
  }

  .edge:hover svg {
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: no-preference) {
    .edge,
    .edge svg {
      transition:
        background-color 120ms,
        opacity 120ms;
    }
  }

  /* Touch screens and imprecise pointers keep the whole page for the book. */
  @media not ((hover: hover) and (pointer: fine)) {
    .edges {
      display: none;
    }
  }
</style>
