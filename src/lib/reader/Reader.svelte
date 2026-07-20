<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from '../i18n/index.svelte'
  import SettingsDialog from '../settings/SettingsDialog.svelte'
  import { settings } from '../settings/index.svelte'
  import { bookContentCss } from '../theme/book'
  import { decideScripting } from '../scripting/consent'
  import { backdropClose } from '../ui/backdrop.svelte'
  import { bookIsScripted, openBook, type FoliateViewElement, type TocItem } from './foliate'

  interface Props {
    file: Blob
    initialPosition?: string | null
    /** Recorded scripting consent from the book's metadata record (§3.4). */
    scriptingConsent?: boolean | undefined
    /** The URL this book was fetched from (`?book=`), offered to the editor. */
    sourceUrl?: string | null
    /** False for an embedded copy, whose session trust is not a stored answer. */
    trustEditable?: boolean
    onrelocate: (location: { cfi: string; fraction: number }) => void
    onconsent: (granted: boolean) => void
    ondownload: () => void
    onclose: () => void
  }
  let {
    file,
    initialPosition = null,
    scriptingConsent = undefined,
    sourceUrl = null,
    trustEditable = true,
    onrelocate,
    onconsent,
    ondownload,
    onclose,
  }: Props = $props()

  let container: HTMLDivElement
  let tocDialog: HTMLDialogElement
  let consentDialog: HTMLDialogElement
  let settingsDialog: SettingsDialog
  let view = $state<FoliateViewElement>()
  let error = $state('')
  // Only a scripted book has anything to trust, so only it gets the toggle.
  let scripted = $state(false)

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
      allowScripts: scriptingConsent === true,
      onSectionLoad: handleSectionLoad,
      onRelocate: onrelocate,
    })
      .then((opened) => {
        view = opened
        disposed = opened
        // §3.4 step 3: a scripted book with no recorded answer renders
        // stripped (that already happened) and asks once.
        scripted = bookIsScripted(opened.book)
        if (decideScripting(scripted, scriptingConsent) === 'ask') {
          consentDialog.showModal()
        }
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

  function handleConsentAnswer(granted: boolean): void {
    consentDialog.close()
    onconsent(granted)
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (tocDialog?.open || consentDialog?.open || settingsDialog?.isOpen()) return
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
    <button onclick={ondownload} aria-label={t('Download')} title={t('Download')}>⤓</button>
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

<SettingsDialog
  bind:this={settingsDialog}
  reading={{
    trust:
      scripted && trustEditable
        ? { consent: scriptingConsent === true, ontoggle: onconsent }
        : undefined,
    sourceUrl,
  }}
/>

<!-- §3.4 one-time consent prompt. Enable and Keep-off both persist via
     onconsent; dismissing (Esc) records nothing and re-asks next open. -->
<dialog
  bind:this={consentDialog}
  class="consent"
  aria-label={t('Interactive features')}
  use:backdropClose
>
  <p>{t('This book has interactive features (audio, and similar). Enable them?')}</p>
  <div class="consent-actions">
    <button onclick={() => handleConsentAnswer(true)}>{t('Enable them')}</button>
    <button onclick={() => handleConsentAnswer(false)}>{t('Keep them off')}</button>
  </div>
</dialog>

<dialog bind:this={tocDialog} class="toc" aria-label={t('Contents')} use:backdropClose>
  <header class="toc-head">
    <button onclick={() => tocDialog.close()} aria-label={t('Close')} title={t('Close')}>✕</button>
  </header>
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

  dialog.consent {
    max-inline-size: 24rem;
  }

  .consent-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: end;
  }

  .consent-actions button {
    font: inherit;
  }

  dialog.toc {
    margin: 0;
    inset-block-start: 0;
    inset-inline-start: 0;
    /* border-box so the 100svh height includes the padding — with the default
       content-box, padding pushed the drawer past the viewport and the tail
       of a long TOC scrolled off-screen and clipped. */
    box-sizing: border-box;
    block-size: 100svh;
    /* Override the UA modal cap (max-height: calc(100% - 6px - 2em)), which
       otherwise leaves a backdrop gap below the drawer. */
    max-block-size: 100svh;
    border: none;
    border-inline-end: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
    /* Fixed-width drawer (capped on narrow screens) so long titles wrap
       instead of stretching it to the longest entry. */
    inline-size: 22rem;
    max-inline-size: 85vw;
    overflow-y: auto;
  }

  dialog.toc ul {
    list-style: none;
    padding-inline-start: 1rem;
    margin: 0.25rem 0;
  }

  dialog.toc nav > ul {
    padding-inline-start: 0;
  }

  /* Sticky close header so it stays reachable while the list scrolls. */
  .toc-head {
    display: flex;
    justify-content: end;
    position: sticky;
    inset-block-start: 0;
    background: Canvas;
    padding-block-end: 0.25rem;
  }

  .toc-head button {
    font: inherit;
    min-inline-size: 2rem;
  }

  dialog.toc nav button,
  dialog.toc li > span {
    display: block;
    inline-size: 100%;
    text-align: start;
    /* Break even long unbroken tokens (slugs, filenames) rather than overflow. */
    overflow-wrap: anywhere;
  }

  dialog.toc nav button {
    background: none;
    border: none;
    color: LinkText;
    text-decoration: underline;
    cursor: pointer;
    padding: 0.25rem 0;
    font: inherit;
  }
</style>
