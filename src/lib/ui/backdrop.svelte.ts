// Svelte action: close a modal <dialog> when the click lands on its backdrop
// (outside the dialog's own box). Escape already closes modal dialogs
// natively; this adds the click-outside gesture readers expect.
export function backdropClose(dialog: HTMLDialogElement) {
  const onClick = (event: MouseEvent) => {
    // A click on the backdrop targets the dialog element with coordinates
    // outside its rect; a click on the content is within the rect.
    const r = dialog.getBoundingClientRect()
    const outside =
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    // Ignore the synthetic (0,0) click that keyboard-activating a button emits.
    if (outside && (event.clientX !== 0 || event.clientY !== 0)) dialog.close()
  }
  dialog.addEventListener('click', onClick)
  return {
    destroy() {
      dialog.removeEventListener('click', onClick)
    },
  }
}
