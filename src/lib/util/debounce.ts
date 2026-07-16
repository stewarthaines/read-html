// Trailing-edge debounce with a manual flush, used to persist the reading
// position without writing on every relocate (§3.3) while never losing the
// final position when the reader closes.
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Args | undefined

  const invoke = () => {
    timer = undefined
    if (pending) {
      const args = pending
      pending = undefined
      fn(...args)
    }
  }

  const debounced = (...args: Args) => {
    pending = args
    clearTimeout(timer)
    timer = setTimeout(invoke, wait)
  }
  debounced.flush = () => {
    clearTimeout(timer)
    invoke()
  }
  return debounced
}
