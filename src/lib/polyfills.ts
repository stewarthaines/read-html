// ES2024 Object.groupBy / Map.groupBy polyfills. Safari shipped both in 17.4;
// devices capped at iOS 16 (e.g. iPhone 8) lack them, and the vendored
// foliate-js epub.js uses both when parsing EPUB metadata — so without these,
// no book opens on those browsers ("undefined is not a function ... groupBy").
// Imported first in main.ts, before any book is parsed.

export function objectGroupBy<T, K extends PropertyKey>(
  items: Iterable<T>,
  keyFn: (item: T, index: number) => K,
): Partial<Record<K, T[]>> {
  // Null-prototype object, matching the spec (safe against keys like __proto__).
  const result = Object.create(null) as Partial<Record<K, T[]>>
  let index = 0
  for (const item of items) {
    const key = keyFn(item, index++)
    const group = result[key]
    if (group) group.push(item)
    else result[key] = [item]
  }
  return result
}

export function mapGroupBy<T, K>(
  items: Iterable<T>,
  keyFn: (item: T, index: number) => K,
): Map<K, T[]> {
  const result = new Map<K, T[]>()
  let index = 0
  for (const item of items) {
    const key = keyFn(item, index++)
    const group = result.get(key)
    if (group) group.push(item)
    else result.set(key, [item])
  }
  return result
}

declare global {
  interface ObjectConstructor {
    groupBy?: typeof objectGroupBy
  }
  interface MapConstructor {
    groupBy?: typeof mapGroupBy
  }
}

if (typeof Object.groupBy !== 'function') Object.groupBy = objectGroupBy
if (typeof Map.groupBy !== 'function') Map.groupBy = mapGroupBy
