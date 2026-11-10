// Which paging keys a focused element needs for itself (§3.3 keyboard).
// Paging is the default: a key pages the book unless the focused element
// would act on that key itself. A button keeps Space (it activates it) but
// has no use for arrows, so focus left on a toolbar button — as after a
// dialog closes — does not block paging.

// Inputs that only act on Space (and Enter, which never pages).
const SPACE_ONLY_INPUTS = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'file',
  'image',
  'color',
])

/** True when `target` would act on `key` itself, so the book must not page. */
export function keyIsClaimed(target: EventTarget | null, key: string): boolean {
  // Duck-typed rather than `instanceof Element`: keys from a book section
  // come from its iframe, whose elements belong to another realm.
  if (!target || !('closest' in target) || typeof target.closest !== 'function') return false
  const element = target as Element
  // Anything inside a dialog belongs to the dialog, open or not.
  if (element.closest('dialog')) return true
  const editable = element.closest(
    'textarea, select, [contenteditable]:not([contenteditable="false"])',
  )
  if (editable) return true
  const input = element.closest('input')
  if (input) {
    const type = (input.getAttribute('type') ?? 'text').toLowerCase()
    return SPACE_ONLY_INPUTS.has(type) ? key === ' ' : true
  }
  if (element.closest('button, summary, [role="button"]')) return key === ' '
  return false
}
