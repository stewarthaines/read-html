<script lang="ts">
  import { t } from '../i18n'
  import type { BookRecord } from '../storage/types'

  interface Props {
    books: BookRecord[]
    onopen: (book: BookRecord) => void
    ondelete: (book: BookRecord) => void
    onpick: (file: File) => void
  }
  let { books, onopen, ondelete, onpick }: Props = $props()

  let coverUrls = $state<Map<string, string>>(new Map())
  $effect(() => {
    const urls = new Map(
      books
        .filter((book) => book.coverThumb)
        .map((book) => [book.id, URL.createObjectURL(book.coverThumb as Blob)]),
    )
    coverUrls = urls
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  })

  function handlePick(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    // Reset so picking the same file again still fires a change event.
    input.value = ''
    if (file) onpick(file)
  }
</script>

<main>
  <h1><label for="book-file">{t('Open a book')}</label></h1>
  <input id="book-file" type="file" accept=".epub,application/epub+zip" onchange={handlePick} />
  {#if books.length > 0}
    <ul class="books">
      {#each books as book (book.id)}
        <li>
          <button class="open" onclick={() => onopen(book)}>
            {#if coverUrls.has(book.id)}
              <img class="cover" src={coverUrls.get(book.id)} alt="" />
            {:else}
              <span class="cover" aria-hidden="true"></span>
            {/if}
            <span class="title">{book.title}</span>
            <span class="author">{book.author}</span>
            <span class="progress">{Math.round(book.fraction * 100)}%</span>
          </button>
          <button
            class="delete"
            onclick={() => ondelete(book)}
            aria-label="{t('Delete')} {book.title}">✕</button
          >
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main {
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: normal;
  }

  .books {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
  }

  li {
    position: relative;
  }

  .open {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    inline-size: 10rem;
    padding: 0.5rem;
    font: inherit;
    background: none;
    border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
    cursor: pointer;
  }

  .cover {
    inline-size: 8rem;
    block-size: 12rem;
    object-fit: contain;
    background: color-mix(in srgb, CanvasText 8%, Canvas);
  }

  span.cover {
    display: block;
  }

  .title {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .author,
  .progress {
    font-size: 0.85rem;
    color: color-mix(in srgb, CanvasText 70%, Canvas);
  }

  .delete {
    position: absolute;
    inset-block-start: 0.25rem;
    inset-inline-end: 0.25rem;
    font: inherit;
  }
</style>
