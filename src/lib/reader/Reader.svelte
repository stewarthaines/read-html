<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from '../i18n/index.svelte'
  import SettingsDialog from '../settings/SettingsDialog.svelte'
  import { settings } from '../settings/index.svelte'
  import { bookContentCss } from '../theme/book'
  import { openBook, type FoliateViewElement, type TocItem } from './foliate'

  interface Props {
    file: Blob
    initialPosition?: string | null
    onrelocate: (location: { cfi: string; fraction: number }) => void
    onclose: () => void
  }
  let { file, initialPosition = null, onrelocate, onclose }: Props = $props()

  let container: HTMLDivElement
  let tocDialog: HTMLDialogElement
  let settingsDialog: SettingsDialog
  let view = $state<FoliateViewElement>()
  let error = $state('')

  // Reading-comfort settings apply live (§3.5): flow via the renderer's
  // observed attribute, font size and theme via injected section CSS.
  $effect(() => {
    view?.renderer.setAttribute('flow', settings.flow)
  })
  $effect(() => {
    view?.renderer.setStyles?.(bookContentCss(settings))
  })

  const toc = $derived(view?.book.toc ?? [])
  const title = $derived.by(() => {
    const raw = view?.book.metadata?.title
    return typeof raw === 'string' ? raw : ''
  })
  // Toolbar paging is logical (§3.3: "next" advances in reading order); only
  // the arrow glyphs are physical, following the book's progression direction.
  const bookIsRtl = $derived(view?.book.dir === 'rtl')

  onMount(() => {
    let disposed: FoliateViewElement | undefined
    openBook({
      file,
      container,
      lastLocation: initialPosition,
      flow: settings.flow,
      styles: bookContentCss(settings),
      onSectionLoad: handleSectionLoad,
      onRelocate: onrelocate,
    })
      .then((opened) => {
        view = opened
        disposed = opened
      })
      .catch((cause: unknown) => {
        error = t('This book could not be opened.') + ' ' + String(cause)
      })
    return () => {
      disposed?.close()
      disposed?.remove()
    }
  })

  // Book sections live in same-origin iframes that swallow keyboard events,
  // so paging keys are attached to each section document as it loads. The
  // iframe also needs an accessible name, which foliate does not set.
  function handleSectionLoad(doc: Document): void {
    doc.addEventListener('keydown', handleKeydown)
    doc.defaultView?.frameElement?.setAttribute('title', t('Book content'))
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (tocDialog?.open || settingsDialog?.isOpen()) return
    // Keys aimed at form controls (selects, the file input, buttons) must
    // act on the control, never page the book.
    if (
      event.target instanceof Element &&
      event.target.closest('input, select, button, textarea, dialog')
    )
      return
    switch (event.key) {
      // Arrows are physical; goLeft/goRight map them to logical prev/next
      // from the book's page-progression direction (§3.3).
      case 'ArrowLeft':
        view?.goLeft()
        break
      case 'ArrowRight':
        view?.goRight()
        break
      case 'PageUp':
        view?.prev()
        break
      case 'PageDown':
      case ' ':
        view?.next()
        break
      default:
        return
    }
    event.preventDefault()
  }

  function goToEntry(item: TocItem): void {
    if (item.href) view?.goTo(item.href)
    tocDialog.close()
  }
</script>

{#snippet tocEntries(items: TocItem[])}
  <ul>
    {#each items as item (item)}
      <li>
        {#if item.href}
          <button onclick={() => goToEntry(item)}>{item.label}</button>
        {:else}
          <span>{item.label}</span>
        {/if}
        {#if item.subitems?.length}
          {@render tocEntries(item.subitems)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<svelte:window onkeydown={handleKeydown} />

<div class="reader">
  <header class="toolbar">
    <button onclick={onclose} aria-label={t('Library')} title={t('Library')}>←</button>
    <button onclick={() => tocDialog.showModal()} aria-label={t('Contents')} title={t('Contents')}
      >☰</button
    >
    <h1>{title}</h1>
    <button onclick={() => settingsDialog.open()} aria-label={t('Settings')} title={t('Settings')}
      >⚙</button
    >
    <button onclick={() => view?.prev()} aria-label={t('Previous page')} title={t('Previous page')}
      >{bookIsRtl ? '›' : '‹'}</button
    >
    <button onclick={() => view?.next()} aria-label={t('Next page')} title={t('Next page')}
      >{bookIsRtl ? '‹' : '›'}</button
    >
  </header>
  <main aria-label={t('Book')}>
    {#if error}
      <p role="alert">{error}</p>
    {/if}
    <div class="view" bind:this={container}></div>
  </main>
</div>

<SettingsDialog bind:this={settingsDialog} />

<dialog bind:this={tocDialog} aria-label={t('Contents')}>
  {#if toc.length > 0}
    <nav>
      {@render tocEntries(toc)}
    </nav>
  {:else}
    <p>{t('This book has no table of contents.')}</p>
  {/if}
</dialog>

<style>
  .reader {
    display: flex;
    flex-direction: column;
    height: 100svh;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-block-end: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
  }

  .toolbar h1 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    font-weight: normal;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar button {
    font-size: 1rem;
    min-inline-size: 2rem;
  }

  main {
    flex: 1;
    min-block-size: 0;
    display: flex;
    flex-direction: column;
  }

  .view {
    flex: 1;
    min-block-size: 0;
    display: flex;
    flex-direction: column;
  }

  .view :global(foliate-view) {
    flex: 1;
    min-block-size: 0;
  }

  dialog {
    margin: 0;
    max-block-size: 100svh;
    block-size: 100svh;
    inset-inline-start: 0;
    border: none;
    border-inline-end: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
    min-inline-size: 16rem;
  }

  dialog ul {
    list-style: none;
    padding-inline-start: 1rem;
    margin: 0.25rem 0;
  }

  dialog nav > ul {
    padding-inline-start: 0;
  }

  dialog button {
    background: none;
    border: none;
    color: LinkText;
    text-decoration: underline;
    cursor: pointer;
    padding: 0.25rem 0;
    font: inherit;
    text-align: start;
  }
</style>
