import { expect, test } from 'vitest'
import { checkIntegrationPoints, INTEGRATION_POINTS } from '../scripts/vendor-check.mjs'

test('the vendored foliate-js integration points are intact', () => {
  expect(checkIntegrationPoints()).toEqual([])
})

test('a changed integration point is reported', () => {
  const changed = checkIntegrationPoints(() => 'not the expected source')
  expect(changed).toHaveLength(INTEGRATION_POINTS.length)
})
