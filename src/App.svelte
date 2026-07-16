<script lang="ts">
  import { t } from './lib/i18n'
  import Reader from './lib/reader/Reader.svelte'

  // Single-page app (§3.3): views switch in state. M1 has the start screen
  // and the reader; library, settings, and catalog land in later milestones.
  let book = $state<File>()

  function handlePick(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    book = input.files?.[0]
  }
</script>

{#if book}
  <Reader file={book} />
{:else}
  <main>
    <h1><label for="book-file">{t('Open a book')}</label></h1>
    <input id="book-file" type="file" accept=".epub,application/epub+zip" onchange={handlePick} />
  </main>
{/if}

<style>
  main {
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: normal;
  }
</style>
